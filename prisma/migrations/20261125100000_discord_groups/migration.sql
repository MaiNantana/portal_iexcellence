-- CreateTable
CREATE TABLE `discord_groups` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `webhookEnc` TEXT NOT NULL,
    `webhookId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'connected',
    `createdByEmail` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `discord_groups_orgId_webhookId_key`(`orgId`, `webhookId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `discord_groups` ADD CONSTRAINT `discord_groups_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `orgs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
