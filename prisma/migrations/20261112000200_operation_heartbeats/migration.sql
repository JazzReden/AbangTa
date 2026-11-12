CREATE TABLE `operation_heartbeats` (
    `name` VARCHAR(64) NOT NULL,
    `lastStartedAt` DATETIME(3) NULL,
    `lastSucceededAt` DATETIME(3) NULL,
    `lastFailedAt` DATETIME(3) NULL,
    `consecutiveFailures` INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
