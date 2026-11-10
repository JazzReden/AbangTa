import Decimal from 'decimal.js';
import { prisma } from '@/lib/db/prisma';
import { RoomJoinService } from './room-join.service';
import { RoomShareService } from './room-share.service';

export class TenantHomeService {
  static async getSummary(tenantId: string) {
    const [bills, payments, notifications, joins, roomRequests] = await Promise.all([
      prisma.bill.findMany({ where: { tenancy: { tenantId }, cancelledAt: null }, select: { totalAmount: true, amountPaid: true } }),
      prisma.payment.findMany({ where: { tenancy: { tenantId }, voidedAt: null }, orderBy: { paymentDate: 'desc' }, take: 5 }),
      prisma.notification.findMany({ where: { userId: tenantId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      RoomJoinService.tenantRequests(tenantId),
      RoomShareService.tenantRequests(tenantId),
    ]);
    return {
      billCount: bills.length,
      balance: bills.reduce((sum, bill) => sum.plus(Decimal.max(0, new Decimal(bill.totalAmount).minus(bill.amountPaid))), new Decimal(0)),
      payments, notifications,
      joins: [
        ...joins.map(request => ({ id: request.id, status: request.status, propertyName: request.invite.tenancy.property.name, roomNumber: request.invite.tenancy.room.roomNumber, expiresAt: request.invite.expiresAt })),
        ...roomRequests.map(request => ({ id: request.id, status: request.status, propertyName: request.room.property.name, roomNumber: request.room.roomNumber, expiresAt: null })),
      ],
    };
  }
}
