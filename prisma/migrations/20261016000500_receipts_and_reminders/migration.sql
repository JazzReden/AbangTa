ALTER TABLE `bills` ADD COLUMN `lastReminderAt` DATETIME(3) NULL;
ALTER TABLE `payments` ADD COLUMN `confirmedAt` DATETIME(3) NULL;

CREATE TABLE `payment_receipts` (
  `id` VARCHAR(191) NOT NULL,
  `paymentId` VARCHAR(191) NOT NULL,
  `snapshot` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `payment_receipts_paymentId_key` (`paymentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payment_receipts` ADD CONSTRAINT `payment_receipts_paymentId_fkey`
  FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
