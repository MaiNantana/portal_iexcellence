-- CreateTable
CREATE TABLE `services` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `icon` VARCHAR(191) NOT NULL DEFAULT 'wrench',
    `taskWorkspaceId` VARCHAR(191) NOT NULL,
    `taskProjectId` VARCHAR(191) NOT NULL,
    `taskLabel` VARCHAR(191) NOT NULL,
    `openMode` VARCHAR(191) NOT NULL DEFAULT 'board',
    `audience` VARCHAR(191) NOT NULL DEFAULT 'all',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `services_orgId_idx`(`orgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `orgs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
