ALTER TABLE `payments` MODIFY `paymentMethod` ENUM('CASH', 'GCASH', 'BANK_TRANSFER', 'OTHER', 'ADVANCE') NOT NULL;

CREATE TABLE `tenant_fund_entries` (
  `id` VARCHAR(191) NOT NULL,
  `tenancyId` VARCHAR(191) NOT NULL,
  `kind` ENUM('DEPOSIT_RECEIVED', 'DEPOSIT_REFUNDED', 'DEPOSIT_DEDUCTED', 'ADVANCE_RECEIVED', 'ADVANCE_REFUNDED') NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `paymentMethod` ENUM('CASH', 'GCASH', 'BANK_TRANSFER', 'OTHER', 'ADVANCE') NULL,
  `paymentDate` DATETIME(3) NOT NULL,
  `referenceNumber` VARCHAR(100) NULL,
  `idempotencyKey` VARCHAR(36) NOT NULL,
  `notes` VARCHAR(500) NULL,
  `recordedById` VARCHAR(191) NOT NULL,
  `confirmedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `voidedAt` DATETIME(3) NULL,
  `voidReason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `tenant_fund_entries_idempotencyKey_key` (`idempotencyKey`),
  INDEX `tenant_fund_entries_tenancyId_kind_voidedAt_idx` (`tenancyId`, `kind`, `voidedAt`),
  INDEX `tenant_fund_entries_paymentDate_idx` (`paymentDate`),
  PRIMARY KEY (`id`),
  CONSTRAINT `tenant_fund_entries_tenancyId_fkey` FOREIGN KEY (`tenancyId`) REFERENCES `tenancies` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `money_references` (
  `key` CHAR(64) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`key`),
  INDEX `money_references_ownerId_idx` (`ownerId`),
  CONSTRAINT `money_references_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `money_references` (`key`, `ownerId`)
SELECT `referenceKey`, `recordedById` FROM `payments` WHERE `referenceKey` IS NOT NULL;
