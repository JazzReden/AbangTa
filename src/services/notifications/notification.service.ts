import { prisma } from '@/lib/db/prisma';

export class NotificationService {
  static async getNotifications(userId: string, limit = 30) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  static async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }

  static async markAsRead(notificationId: string, userId: string) {
    const n = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!n) throw new Error('Notification not found');
    if (n.userId !== userId) throw new Error('FORBIDDEN');
    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  static async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
