CREATE TABLE `property_billing_charges` (
  `id` VARCHAR(191) NOT NULL,
  `propertyId` VARCHAR(191) NOT NULL,
  `itemType` ENUM('WIFI', 'PARKING') NOT NULL,
  `treatment` ENUM('ADDITIONAL', 'INCLUDED', 'FREE') NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `property_billing_charges_propertyId_itemType_key` (`propertyId`, `itemType`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `property_billing_charges` ADD CONSTRAINT `property_billing_charges_propertyId_fkey`
  FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
