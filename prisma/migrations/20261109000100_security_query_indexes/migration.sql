-- Additive lookup indexes only. No tables or business records are removed.
CREATE INDEX `tenancies_tenantId_status_idx` ON `tenancies` (`tenantId`, `status`);
CREATE INDEX `bills_propertyId_cancelledAt_status_dueDate_idx` ON `bills` (`propertyId`, `cancelledAt`, `status`, `dueDate`);
CREATE INDEX `payment_proofs_status_createdAt_id_idx` ON `payment_proofs` (`status`, `createdAt`, `id`);
CREATE INDEX `maintenance_requests_propertyId_status_priority_createdAt_idx` ON `maintenance_requests` (`propertyId`, `status`, `priority`, `createdAt`);
CREATE INDEX `maintenance_requests_createdById_createdAt_idx` ON `maintenance_requests` (`createdById`, `createdAt`);
CREATE INDEX `notifications_userId_isRead_createdAt_idx` ON `notifications` (`userId`, `isRead`, `createdAt`);
