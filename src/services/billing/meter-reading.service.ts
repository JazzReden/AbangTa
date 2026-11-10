import { withTransactionRetry } from "@/lib/db/transaction-retry";
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db/prisma';
import { assertLandlordOwnsProperty } from '@/lib/permissions';
import type { MeterReadingInput } from '@/types';

export class MeterReadingService {
  /**
   * Create a new meter reading with full validation.
   * - current >= previous unless isMeterReset=true
   * - Stores consumption, rate snapshot, and calculated charge
   */
  static async createReading(
    input: MeterReadingInput,
    landlordId: string
  ) {
    await assertLandlordOwnsProperty(landlordId, input.propertyId);

    return withTransactionRetry(() => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM utility_configs WHERE id = ${input.utilityConfigId} FOR UPDATE`;
    const config = await tx.utilityConfig.findUnique({
      where: { id: input.utilityConfigId },
    });
    if (!config) throw new Error('Utility configuration not found');
    if (config.propertyId !== input.propertyId) throw new Error('Utility does not belong to this property');
    if (input.roomId) {
      const room = await tx.room.findUnique({ where: { id: input.roomId } });
      if (!room || room.propertyId !== input.propertyId || room.archivedAt) throw new Error('Room does not belong to this property');
    }
    if (config.splitMethod === 'PER_ROOM' && !input.roomId) throw new Error('A room is required for this meter');
    if (config.splitMethod === 'EQUAL_SPLIT' && input.roomId) throw new Error('Shared readings must use the property meter');
    if (![input.billingPeriodStart, input.billingPeriodEnd, input.readingDate].every(d => Number.isFinite(new Date(d).getTime())) ||
      input.billingPeriodEnd < input.billingPeriodStart) throw new Error('Invalid meter reading dates');
    if (config.billingMethod !== 'METERED') {
      throw new Error('This utility is not configured for metered billing');
    }
    if (!config.ratePerUnit) {
      throw new Error('Rate per unit is not configured for this utility');
    }

    const prev = new Decimal(input.previousReading);
    const curr = new Decimal(input.currentReading);
    if (!prev.isFinite() || !curr.isFinite() || prev.isNegative() || curr.isNegative() ||
      prev.decimalPlaces() > 3 || curr.decimalPlaces() > 3) throw new Error('Invalid meter readings');

    if (!input.isMeterReset && curr.lessThan(prev)) {
      throw new Error(
        'Current reading cannot be lower than the previous reading. ' +
          'If the meter was replaced, enable the Meter Reset option.'
      );
    }

    // On meter reset, consumption is the new current reading
    const consumption = input.isMeterReset ? curr : curr.minus(prev);

    if (consumption.lessThan(0)) {
      throw new Error('Consumption cannot be negative');
    }

    const latest = await tx.meterReading.findFirst({
      where: { utilityConfigId: config.id, roomId: input.roomId ?? null },
      orderBy: { billingPeriodEnd: 'desc' },
    });
    if (latest && latest.billingPeriodEnd >= input.billingPeriodStart) throw new Error('A reading already covers this period; historical readings are preserved');
    if (latest && !input.isMeterReset && !prev.equals(latest.currentReading)) throw new Error('Previous reading must match the last recorded reading');
    const rateAtTime = new Decimal(config.ratePerUnit);
    const chargeAmount = consumption.mul(rateAtTime).toDecimalPlaces(2);

    return tx.meterReading.create({
      data: {
        utilityConfigId: input.utilityConfigId,
        propertyId: input.propertyId,
        roomId: input.roomId ?? null,
        billingPeriodStart: new Date(input.billingPeriodStart),
        billingPeriodEnd: new Date(input.billingPeriodEnd),
        previousReading: prev,
        currentReading: curr,
        consumption,
        rateAtTime,
        chargeAmount,
        readingDate: new Date(input.readingDate),
        isMeterReset: input.isMeterReset ?? false,
        notes: input.notes ?? null,
        createdById: landlordId,
      },
    });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  /** Get the most recent reading for a utility config, optionally filtered by room. */
  static async getLatestReading(utilityConfigId: string, roomId?: string) {
    return prisma.meterReading.findFirst({
      where: { utilityConfigId, roomId: roomId ?? null },
      orderBy: { readingDate: 'desc' },
    });
  }

  static async getAllReadings(utilityConfigId: string, limit = 50) {
    return prisma.meterReading.findMany({
      where: { utilityConfigId },
      orderBy: { readingDate: 'desc' },
      take: limit,
      include: {
        room: { select: { roomNumber: true } },
        createdBy: { select: { name: true } },
      },
    });
  }

  static async getPropertyReadings(propertyId: string, landlordId: string) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    return prisma.meterReading.findMany({
      where: { propertyId },
      include: {
        room: { select: { id: true, roomNumber: true } },
        utilityConfig: { select: { utilityType: true, unit: true, billingMethod: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { readingDate: 'desc' },
      take: 100,
    });
  }
}
