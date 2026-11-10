-- CreateTable
CREATE TABLE `rate_limit_buckets` (
    `key` CHAR(64) NOT NULL,
    `count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `resetAt` DATETIME(3) NOT NULL,

    INDEX `rate_limit_buckets_resetAt_idx`(`resetAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


