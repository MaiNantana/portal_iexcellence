-- CreateTable
CREATE TABLE `discord_links` (
    `userId` VARCHAR(191) NOT NULL,
    `discordUserId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `dmChannelId` VARCHAR(191) NULL,
    `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `discord_links_discordUserId_idx`(`discordUserId`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notify_deliveries` (
    `key` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notify_deliveries_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`key`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `discord_links` ADD CONSTRAINT `discord_links_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
