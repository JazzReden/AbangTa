-- AlterTable
ALTER TABLE `invite_tokens` ADD COLUMN `codeHash` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `room_join_requests` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `inviteId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `room_join_requests_inviteId_status_idx`(`inviteId`, `status`),
    UNIQUE INDEX `room_join_requests_userId_inviteId_key`(`userId`, `inviteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `invite_tokens_codeHash_key` ON `invite_tokens`(`codeHash`);

-- AddForeignKey
ALTER TABLE `room_join_requests` ADD CONSTRAINT `room_join_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_join_requests` ADD CONSTRAINT `room_join_requests_inviteId_fkey` FOREIGN KEY (`inviteId`) REFERENCES `invite_tokens`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
