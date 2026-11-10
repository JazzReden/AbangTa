CREATE TABLE `assistant_reminders` (
    `id` VARCHAR(191) NOT NULL,
    `landlordId` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NOT NULL,
    `language` VARCHAR(3) NOT NULL,
    `template` VARCHAR(1000) NOT NULL,
    `previewHash` CHAR(64) NOT NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'SENT', 'SKIPPED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
    `scheduledAt` DATETIME(3) NULL,
    `attemptedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `outcome` VARCHAR(250) NULL,
    `deliveredMessage` VARCHAR(1500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `assistant_reminders_status_scheduledAt_idx`(`status`, `scheduledAt`),
    INDEX `assistant_reminders_landlordId_createdAt_idx`(`landlordId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `assistant_reminders` ADD CONSTRAINT `assistant_reminders_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
