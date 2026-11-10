ALTER TABLE `notifications` MODIFY `type` ENUM('RENT_DUE_SOON', 'RENT_OVERDUE', 'NEW_BILL', 'PAYMENT_RECORDED', 'MAINTENANCE_STATUS_CHANGED', 'NEW_ANNOUNCEMENT', 'TENANT_INVITATION', 'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_PROOF_REVIEWED') NOT NULL;

CREATE TABLE `payment_proofs` (
    `id` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `referenceNumber` VARCHAR(100) NOT NULL,
    `image` MEDIUMBLOB NOT NULL,
    `imageHash` CHAR(64) NOT NULL,
    `idempotencyKey` VARCHAR(36) NOT NULL,
    `pendingBillId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `paymentId` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `payment_proofs_idempotencyKey_key`(`idempotencyKey`),
    UNIQUE INDEX `payment_proofs_pendingBillId_key`(`pendingBillId`),
    UNIQUE INDEX `payment_proofs_paymentId_key`(`paymentId`),
    INDEX `payment_proofs_billId_createdAt_idx`(`billId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `bills`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
