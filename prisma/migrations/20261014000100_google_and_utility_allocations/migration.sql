-- AlterTable
ALTER TABLE `users` ADD COLUMN `googleSubject` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `utility_allocations` (
    `id` VARCHAR(191) NOT NULL,
    `configId` VARCHAR(191) NOT NULL,
    `roomKey` VARCHAR(191) NOT NULL DEFAULT '',
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `meterReadingId` VARCHAR(191) NULL,

    UNIQUE INDEX `utility_allocations_configId_roomKey_periodStart_periodEnd_key`(`configId`, `roomKey`, `periodStart`, `periodEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `utility_shares` (
    `id` VARCHAR(191) NOT NULL,
    `allocationId` VARCHAR(191) NOT NULL,
    `tenancyId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,

    INDEX `utility_shares_tenancyId_idx`(`tenancyId`),
    UNIQUE INDEX `utility_shares_allocationId_tenancyId_key`(`allocationId`, `tenancyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `users_googleSubject_key` ON `users`(`googleSubject`);

-- AddForeignKey
ALTER TABLE `utility_allocations` ADD CONSTRAINT `utility_allocations_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `utility_configs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `utility_shares` ADD CONSTRAINT `utility_shares_allocationId_fkey` FOREIGN KEY (`allocationId`) REFERENCES `utility_allocations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `utility_shares` ADD CONSTRAINT `utility_shares_tenancyId_fkey` FOREIGN KEY (`tenancyId`) REFERENCES `tenancies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
