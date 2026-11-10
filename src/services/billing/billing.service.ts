import { withTransactionRetry } from "@/lib/db/transaction-retry";
import Decimal from 'decimal.js';
import { additionalChargesSchema, propertyChargeDefaults } from '@/lib/utils/additional-charges';
import { tenantCharges } from '@/lib/utils/tenant-parking';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { prisma } from '@/lib/db/prisma';
import {
  assertLandlordOwnsBill,
  assertLandlordOwnsProperty,
  assertLandlordOwnsTenancy,
  assertTenantOwnsBill,
} from '@/lib/permissions';
import { remainingBalance } from '@/lib/utils/billing';
import type { BillGenerationInput } from '@/types';
import type { BillStatus, BillingMethod, UtilityConfig, Prisma } from '@prisma/client';

import { allocateRoomCharge } from '@/lib/utils/allocation';
import { billStatusFromAmounts } from '@/lib/utils/billing';
import { TenantFundsService } from './tenant-funds.service';
import { randomUUID } from 'node:crypto';

interface ItemData {
  itemType: 'RENT' | 'WATER' | 'ELECTRICITY' | 'OTHER' | 'WIFI' | 'PARKING';
  chargeTreatment?: 'ADDITIONAL' | 'INCLUDED' | 'FREE';
  description: string;
  billingMethod: BillingMethod;
  amount: Decimal;
  rateSnapshot?: Decimal;
  meterReadingId?: string;
  isIncluded: boolean;
}

/**
 * BillingService — core billing engine for AbangTa 1.0.
 *
 * Key rules enforced here:
 * - INCLUDED utilities → isIncluded=true, amount 0, UI shows "Included in Rent".
 * - FIXED_RATE → snapshot of the rate at billing time.
 * - METERED → linked to a reading or equal-split of a shared charge.
 * - All amounts use Decimal.js — never native JS float arithmetic.
 */
export class BillingService {
  static async generateMonthlyBill(
    input: BillGenerationInput,
    landlordId: string
  ) {
    await assertLandlordOwnsTenancy(landlordId, input.tenancyId);
    const extra = additionalChargesSchema.safeParse(input.additionalCharges ?? []);
    if (!extra.success) throw new Error(extra.error.issues[0].message);
    if (!(await checkRateLimit('bill-generation:' + landlordId, { limit: 120, windowMs: 60000 })).allowed) throw new Error('Too many bills. Please try again shortly.');

    if (![input.billingPeriodStart, input.billingPeriodEnd, input.dueDate].every(d => Number.isFinite(d.getTime())) ||
      input.billingPeriodEnd < input.billingPeriodStart) throw new Error('Invalid billing dates');

    return withTransactionRetry(() => prisma.$transaction(async (tx) => {
    const reference = await tx.tenancy.findUnique({ where: { id: input.tenancyId } });
    if (!reference) throw new Error('Tenancy not found');
    await tx.$queryRaw`SELECT id FROM properties WHERE id = ${reference.propertyId} FOR UPDATE`;
    const tenancy = await tx.tenancy.findUnique({
      where: { id: input.tenancyId },
      include: {
        room: true,
        bed: true,
        property: { include: { utilityConfigs: true, billingCharges: true } },
      },
    });

    if (!tenancy) throw new Error('Tenancy not found');
    if (tenancy.property.landlordId !== landlordId || tenancy.property.archivedAt || tenancy.room.archivedAt) throw new Error('FORBIDDEN');
    if (tenancy.cancelledAt || (tenancy.status !== 'ACTIVE' && tenancy.status !== 'ENDED')) throw new Error('Tenancy is not active');
    if (tenancy.startDate > input.billingPeriodEnd || (tenancy.endDate && tenancy.endDate < input.billingPeriodStart)) throw new Error('Billing period does not overlap this tenancy');
    if (tenancy.room.rentalMode === 'PER_BED' && !tenancy.bedId) throw new Error('Assign a bed before generating a bill');

    const existing = await tx.bill.findFirst({
      where: {
        tenancyId: input.tenancyId,
        billingPeriodStart: { lte: input.billingPeriodEnd },
        billingPeriodEnd: { gte: input.billingPeriodStart },
        cancelledAt: null,
      },
    });
    if (existing) {
      throw new Error('A bill already exists for this tenancy and billing period');
    }

    const cohort = await tx.tenancy.findMany({
      where: { propertyId: tenancy.propertyId, status: { in: ['ACTIVE', 'ENDED'] }, cancelledAt: null,
        startDate: { lte: input.billingPeriodEnd },
        OR: [{ endDate: null }, { endDate: { gte: input.billingPeriodStart } }],
      },
      select: { id: true, roomId: true },
      orderBy: { id: 'asc' },
    });

    const waterConfig = tenancy.property.utilityConfigs.find(
      (c) => c.utilityType === 'WATER'
    );
    const elecConfig = tenancy.property.utilityConfigs.find(
      (c) => c.utilityType === 'ELECTRICITY'
    );

    if (!waterConfig || !elecConfig) throw new Error('Configure water and electricity before generating bills');
    if (tenancy.startDate > input.billingPeriodEnd) throw new Error('Billing period is before tenancy starts');
    const items: ItemData[] = [
      {
        itemType: 'RENT',
        description: `Room ${tenancy.room.roomNumber}${tenancy.bed ? ' / ' + tenancy.bed.label : ''} — Monthly Rent`,
        billingMethod: 'FIXED_RATE',
        amount: new Decimal(tenancy.monthlyRent),
        rateSnapshot: new Decimal(tenancy.monthlyRent),
        isIncluded: false,
      },
    ];

    if (waterConfig) {
      items.push(
        await this.buildUtilityItem({
          label: 'Water',
          itemType: 'WATER',
          config: waterConfig,
          meterReadingId: input.waterMeterReadingId,
          sharedAmount: input.sharedWaterAmount,
          tx, tenancyId: tenancy.id, roomId: tenancy.roomId, cohort,
          periodStart: input.billingPeriodStart, periodEnd: input.billingPeriodEnd,
        })
      );
    }

    if (elecConfig) {
      items.push(
        await this.buildUtilityItem({
          label: 'Electricity',
          itemType: 'ELECTRICITY',
          config: elecConfig,
          meterReadingId: input.electricityMeterReadingId,
          sharedAmount: input.sharedElectricityAmount,
          tx, tenancyId: tenancy.id, roomId: tenancy.roomId, cohort,
          periodStart: input.billingPeriodStart, periodEnd: input.billingPeriodEnd,
        })
      );
    }

    const selectedCharges = input.additionalCharges === undefined
      ? additionalChargesSchema.parse(propertyChargeDefaults(tenancy.property.billingCharges))
      : extra.data;
    const charges = tenantCharges(selectedCharges, tenancy.parkingMode, input.additionalCharges !== undefined);
    for (const charge of charges) items.push({
      itemType: charge.itemType,
      description: charge.itemType === 'WIFI' ? 'Wi-Fi' : charge.itemType === 'PARKING' ? 'Parking' : charge.description,
      chargeTreatment: charge.treatment,
      billingMethod: charge.treatment === 'INCLUDED' ? 'INCLUDED' : 'FIXED_RATE',
      amount: new Decimal(charge.amount),
      isIncluded: charge.treatment === 'INCLUDED',
    });
    const total = items.reduce(
      (sum, item) => (item.isIncluded ? sum : sum.plus(item.amount)),
      new Decimal(0)
    );
    if (!total.isFinite() || total.greaterThan('99999999.99')) throw new Error('Bill total exceeds the supported amount');

      const bill = await tx.bill.create({
        data: {
          tenancyId: input.tenancyId,
          propertyId: tenancy.propertyId,
          billingPeriodStart: input.billingPeriodStart,
          billingPeriodEnd: input.billingPeriodEnd,
          dueDate: input.dueDate,
          totalAmount: total.toDecimalPlaces(2),
          amountPaid: new Decimal(0),
          status: billStatusFromAmounts(total, 0, input.dueDate),
          createdById: landlordId,
          items: {
            create: items.map((item) => ({
              itemType: item.itemType,
              chargeTreatment: item.chargeTreatment,
              description: item.description,
              billingMethod: item.billingMethod,
              amount: item.amount.toDecimalPlaces(2),
              rateSnapshot: item.rateSnapshot ?? null,
              meterReadingId: item.meterReadingId ?? null,
              isIncluded: item.isIncluded,
            })),
          },
        },
        include: { items: true },
      });

      if (input.applyAdvance) await TenantFundsService.applyToBillTx(tx, bill.id, landlordId, { idempotencyKey: randomUUID(), allowEmpty: true });
      const issued = await tx.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { items: true } });

      await tx.notification.create({
        data: {
          userId: tenancy.tenantId,
          type: 'NEW_BILL',
          title: 'New Bill Generated',
          message: `Your bill for ${input.billingPeriodStart.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'long', year: 'numeric' })} is ready. Total billed: ₱${total.toFixed(2)}. Remaining due: ₱${new Decimal(issued.totalAmount).minus(issued.amountPaid).toFixed(2)}`,
          relatedEntityType: 'Bill',
          relatedEntityId: bill.id,
        },
      });

      return issued;
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async recalculateBillStatus(billId: string) {
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM bills WHERE id = ${billId} FOR UPDATE`;
      const bill = await tx.bill.findUnique({
        where: { id: billId }, include: { payments: { where: { voidedAt: null } } },
      });
      if (!bill) throw new Error('Bill not found');
      if (bill.cancelledAt) return bill;
      const paid = bill.payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
      return tx.bill.update({ where: { id: billId }, data: {
        amountPaid: paid, status: billStatusFromAmounts(bill.totalAmount, paid, bill.dueDate),
      } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async updateOverdueStatuses(propertyId: string) {
    return prisma.bill.updateMany({
      where: {
        propertyId,
        dueDate: { lt: new Date() },
        status: { in: ['PENDING', 'PARTIALLY_PAID'] },
        cancelledAt: null,
      },
      data: { status: 'OVERDUE' },
    });
  }

  static async cancelBill(billId: string, landlordId: string) {
    if (!(await checkRateLimit('bill-cancel:' + landlordId, { limit: 30, windowMs: 60000 })).allowed) throw new Error('Too many cancellations. Please try again shortly.');
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM bills WHERE id = ${billId} FOR UPDATE`;
      const bill = await tx.bill.findUnique({
        where: { id: billId },
        include: { property: true, payments: { where: { voidedAt: null } } },
      });
      if (!bill || bill.property.landlordId !== landlordId) throw new Error('FORBIDDEN');
      if (bill.payments.length) throw new Error('Void valid payments before cancelling this bill');
      return tx.bill.update({ where: { id: billId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async getPropertyBills(
    propertyId: string,
    landlordId: string,
    status?: BillStatus
  ) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    await this.updateOverdueStatuses(propertyId);

    return prisma.bill.findMany({
      where: {
        propertyId,
        cancelledAt: null,
        ...(status ? { status } : {}),
      },
      include: {
        tenancy: {
          include: {
            tenant: { select: { id: true, name: true, email: true } },
            room: { select: { id: true, roomNumber: true } },
          },
        },
        items: true,
        payments: { where: { voidedAt: null } },
      },
      orderBy: { billingPeriodStart: 'desc' },
    });
  }

  static async getLandlordBills(landlordId: string, status?: BillStatus) {
    const properties = await prisma.property.findMany({
      where: { landlordId, archivedAt: null },
      select: { id: true },
    });

    await Promise.all(properties.map((property) => this.updateOverdueStatuses(property.id)));

    return prisma.bill.findMany({
      where: {
        property: { landlordId },
        cancelledAt: null,
        ...(status ? { status } : {}),
      },
      include: {
        property: { select: { id: true, name: true } },
        tenancy: {
          include: {
            tenant: { select: { id: true, name: true, email: true } },
            room: { select: { id: true, roomNumber: true } },
          },
        },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  static async getTenantBills(tenantId: string) {
    return prisma.bill.findMany({
      where: { tenancy: { tenantId }, cancelledAt: null },
      include: {
        items: true,
        payments: { where: { voidedAt: null } },
        property: { select: { name: true, landlord: { select: { landlordProfile: { select: { gcashName: true, gcashNumber: true } } } } } },
        tenancy: { include: { room: { select: { roomNumber: true } } } },
      },
      orderBy: { billingPeriodStart: 'desc' },
    });
  }

  static async getBillDetail(billId: string, landlordId: string) {
    await assertLandlordOwnsBill(landlordId, billId);
    return prisma.bill.findUnique({
      where: { id: billId },
      include: {
        items: true,
        payments: {
          where: { voidedAt: null },
          orderBy: { paymentDate: 'desc' },
        },
        property: { select: { id: true, name: true, landlordId: true } },
        tenancy: {
          include: {
            tenant: { select: { id: true, name: true, email: true } },
            room: { select: { id: true, roomNumber: true } },
          },
        },
      },
    });
  }

  static async getTenantBillDetail(billId: string, tenantId: string) {
    await assertTenantOwnsBill(tenantId, billId);
    return prisma.bill.findUnique({
      where: { id: billId },
      include: {
        items: true,
        payments: {
          where: { voidedAt: null },
          orderBy: { paymentDate: 'desc' },
        },
        property: { select: { name: true } },
        tenancy: { include: { room: { select: { roomNumber: true } } } },
      },
    });
  }

  static remaining(totalAmount: Decimal | number | string, amountPaid: Decimal | number | string) {
    return remainingBalance(totalAmount, amountPaid);
  }

  private static async buildUtilityItem(params: {
    label: string;
    itemType: 'WATER' | 'ELECTRICITY';
    config: UtilityConfig;
    meterReadingId?: string;
    sharedAmount?: number;
    tx: Prisma.TransactionClient;
    tenancyId: string;
    roomId: string;
    cohort: Array<{ id: string; roomId: string }>;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<ItemData> {
    const { label, itemType, config, tx } = params;
    const prior = await tx.billItem.findFirst({ where: { itemType, bill: {
      propertyId: config.propertyId, cancelledAt: null,
      billingPeriodStart: params.periodStart, billingPeriodEnd: params.periodEnd,
    } } });
    if (prior && (prior.billingMethod !== config.billingMethod ||
      (config.billingMethod === 'FIXED_RATE' && !new Decimal(prior.rateSnapshot ?? prior.amount).equals(config.fixedAmount ?? -1)))) {
      throw new Error(label + ' configuration changed after bills were issued for this period. Restore that period\'s settings before continuing.');
    }
    const saved = await tx.utilityAllocation.findFirst({ where: { configId: config.id, periodStart: params.periodStart, periodEnd: params.periodEnd } });
    if (saved && (config.billingMethod !== 'METERED' || (config.splitMethod === 'PER_ROOM' ? saved.roomKey === '' : saved.roomKey !== ''))) {
      throw new Error(label + ' has a saved allocation with different billing settings for this period');
    }
    if (config.billingMethod === 'INCLUDED') {
      return { itemType, description: label + ' - Included in Rent', billingMethod: 'INCLUDED', amount: new Decimal(0), isIncluded: true };
    }
    if (config.billingMethod === 'FIXED_RATE') {
      const amount = new Decimal(config.fixedAmount ?? -1);
      if (!amount.isFinite() || amount.isNegative()) throw new Error(label + ' fixed amount is not configured');
      return { itemType, description: label + ' - Monthly Fixed Rate', billingMethod: 'FIXED_RATE', amount, rateSnapshot: amount, isIncluded: false };
    }
    if (params.sharedAmount != null && params.meterReadingId) throw new Error('Choose a reading or shared charge, not both');
    const reading = params.meterReadingId ? await tx.meterReading.findUnique({ where: { id: params.meterReadingId } }) : null;
    if (params.meterReadingId && !reading) throw new Error(label + ' meter reading not found');
    if (reading && (
      reading.utilityConfigId !== config.id || reading.propertyId !== config.propertyId ||
      reading.billingPeriodStart.getTime() !== params.periodStart.getTime() ||
      reading.billingPeriodEnd.getTime() !== params.periodEnd.getTime() ||
      (config.splitMethod === 'PER_ROOM' ? reading.roomId !== params.roomId : reading.roomId !== null)
    )) throw new Error(label + ' reading does not match this property, room, utility or billing period');
    if (config.splitMethod === 'PER_ROOM') {
      if (!reading || params.sharedAmount != null) throw new Error(label + ' requires a matching room reading');
      // Multiple occupants share one room meter, rather than each paying the entire room charge.
      const participants = params.cohort.filter(t => t.roomId === params.roomId);
      const source = new Decimal(reading.chargeAmount);
      const key = { configId: config.id, roomKey: params.roomId, periodStart: params.periodStart, periodEnd: params.periodEnd };
      let allocation = await tx.utilityAllocation.findUnique({
        where: { configId_roomKey_periodStart_periodEnd: key }, include: { shares: true },
      });
      if (allocation && allocation.meterReadingId !== reading.id) throw new Error('This room meter already has a saved allocation for this period');
      if (!allocation) {
        allocation = await tx.utilityAllocation.create({
          data: { ...key, totalAmount: source, meterReadingId: reading.id,
            shares: { create: allocateRoomCharge(source, participants).map(s => ({ tenancyId: s.id, amount: s.amount })) } },
          include: { shares: true },
        });
      }
      const share = allocation.shares.find(s => s.tenancyId === params.tenancyId);
      if (!share) throw new Error('Tenancy is not part of this meter allocation');
      return {
        itemType, description: label + ' - ' + reading.consumption + ' ' + config.unit + ' x ' + reading.rateAtTime + ' / ' + allocation.shares.length + ' occupants (saved allocation)',
        billingMethod: 'METERED', amount: new Decimal(share.amount), rateSnapshot: new Decimal(reading.rateAtTime),
        meterReadingId: reading.id, isIncluded: false,
      };
    }
    if (params.sharedAmount == null && !reading) throw new Error(label + ' requires a property reading or shared charge');
    const total = new Decimal(params.sharedAmount ?? reading!.chargeAmount);
    const key = { configId: config.id, roomKey: '', periodStart: params.periodStart, periodEnd: params.periodEnd };
    let allocation = await tx.utilityAllocation.findUnique({
      where: { configId_roomKey_periodStart_periodEnd: key }, include: { shares: true },
    });
    if (allocation && (!new Decimal(allocation.totalAmount).equals(total) || allocation.meterReadingId !== (reading?.id ?? null))) {
      throw new Error('Shared utility source differs from the saved allocation for this period');
    }
    if (!allocation) {
      const shares = allocateRoomCharge(total, params.cohort);
      allocation = await tx.utilityAllocation.create({
        data: { ...key, totalAmount: total, meterReadingId: reading?.id,
          shares: { create: shares.map(s => ({ tenancyId: s.id, amount: s.amount })) } },
        include: { shares: true },
      });
    }
    const share = allocation.shares.find(s => s.tenancyId === params.tenancyId);
    if (!share) throw new Error('This tenancy was not included in the saved shared utility allocation');
    return {
      itemType, description: label + ' - Equal split (saved allocation ' + allocation.id + ')',
      billingMethod: 'METERED', amount: new Decimal(share.amount),
      rateSnapshot: new Decimal(reading?.rateAtTime ?? total), meterReadingId: reading?.id, isIncluded: false,
    };
  }
}
