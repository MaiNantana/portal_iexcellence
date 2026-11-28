-- CreateTable
CREATE TABLE `line_channels` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `channelSecretEnc` TEXT NOT NULL,
    `accessTokenEnc` TEXT NOT NULL,
    `botName` VARCHAR(191) NULL,
    `basicId` VARCHAR(191) NULL,
    `botUserId` VARCHAR(191) NULL,
    `hubSyncedAt` DATETIME(3) NULL,
    `hubError` VARCHAR(191) NULL,
    `hubWebhookUrl` TEXT NULL,
    `createdByEmail` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `line_channels_orgId_key`(`orgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `line_channels` ADD CONSTRAINT `line_channels_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `orgs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
