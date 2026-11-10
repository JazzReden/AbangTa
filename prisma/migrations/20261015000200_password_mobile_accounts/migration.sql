-- AlterTable
ALTER TABLE `users` ADD COLUMN `mobileLogin` VARCHAR(191) NULL,
    MODIFY `email` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_mobileLogin_key` ON `users`(`mobileLogin`);
