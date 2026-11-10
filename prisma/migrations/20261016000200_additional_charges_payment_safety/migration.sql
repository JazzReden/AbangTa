ALTER TABLE `bill_items`
  MODIFY `itemType` ENUM('RENT', 'WATER', 'ELECTRICITY', 'WIFI', 'PARKING', 'OTHER') NOT NULL,
  ADD COLUMN `chargeTreatment` ENUM('ADDITIONAL', 'INCLUDED', 'FREE') NULL;

ALTER TABLE `payments`
  ADD COLUMN `referenceKey` CHAR(64) NULL,
  ADD COLUMN `idempotencyKey` VARCHAR(36) NULL,
  ADD UNIQUE INDEX `payments_referenceKey_key` (`referenceKey`),
  ADD UNIQUE INDEX `payments_idempotencyKey_key` (`idempotencyKey`);
