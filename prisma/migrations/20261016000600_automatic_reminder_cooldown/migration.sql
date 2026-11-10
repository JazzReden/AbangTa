ALTER TABLE `users` ADD COLUMN `lastBillReminderAt` DATETIME(3) NULL;

-- Preserve recent per-bill deliveries when introducing the tenant-wide cooldown.
UPDATE `users` AS u
JOIN (
  SELECT t.`tenantId`, MAX(b.`lastReminderAt`) AS latest
  FROM `bills` b
  JOIN `tenancies` t ON t.`id` = b.`tenancyId`
  WHERE b.`lastReminderAt` IS NOT NULL
  GROUP BY t.`tenantId`
) recent ON recent.`tenantId` = u.`id`
SET u.`lastBillReminderAt` = recent.latest;
