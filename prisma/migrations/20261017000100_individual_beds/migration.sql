ALTER TABLE `rooms` ADD COLUMN `rentalMode` ENUM('LEGACY_SHARED', 'WHOLE_ROOM', 'PER_BED') NOT NULL DEFAULT 'LEGACY_SHARED';

CREATE TABLE `beds` (
  `id` VARCHAR(191) NOT NULL,
  `roomId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(40) NOT NULL,
  `monthlyRent` DECIMAL(10,2) NOT NULL,
  `status` ENUM('VACANT', 'OCCUPIED', 'MAINTENANCE') NOT NULL DEFAULT 'VACANT',
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `beds_roomId_label_key` (`roomId`, `label`),
  PRIMARY KEY (`id`),
  CONSTRAINT `beds_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `tenancies` ADD COLUMN `bedId` VARCHAR(191) NULL, ADD COLUMN `activeBedKey` VARCHAR(191) NULL, ADD COLUMN `cancelledAt` DATETIME(3) NULL;
CREATE UNIQUE INDEX `tenancies_activeBedKey_key` ON `tenancies` (`activeBedKey`);
CREATE INDEX `tenancies_bedId_idx` ON `tenancies` (`bedId`);
ALTER TABLE `tenancies` ADD CONSTRAINT `tenancies_bedId_fkey` FOREIGN KEY (`bedId`) REFERENCES `beds` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
