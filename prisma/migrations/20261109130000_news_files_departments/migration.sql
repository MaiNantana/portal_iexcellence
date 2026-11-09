-- Each company defines its own departments. Keys stay as the values already stored in
-- memberships.department / news.audience / services.audience / invitations.department.
CREATE TABLE `departments` (
    `orgId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `departments_orgId_name_key`(`orgId`, `name`),
    PRIMARY KEY (`orgId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `departments` ADD CONSTRAINT `departments_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `orgs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing companies keep the three departments that used to be built in.
INSERT INTO `departments` (`orgId`, `key`, `name`) SELECT `id`, 'hr', 'ฝ่ายบุคคล' FROM `orgs`;
INSERT INTO `departments` (`orgId`, `key`, `name`) SELECT `id`, 'it', 'ฝ่าย IT' FROM `orgs`;
INSERT INTO `departments` (`orgId`, `key`, `name`) SELECT `id`, 'production', 'ฝ่ายผลิต' FROM `orgs`;

-- Expiry and email notification for news. Existing posts are never emailed (notifyEmail = false).
ALTER TABLE `news`
    ADD COLUMN `expiresAt` DATETIME(3) NULL,
    ADD COLUMN `notifyEmail` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `notifiedAt` DATETIME(3) NULL;

-- Stored in the database because every deploy mirrors the site folder and would delete uploads.
CREATE TABLE `news_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `newsId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `data` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `news_attachments_newsId_idx`(`newsId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `news_attachments` ADD CONSTRAINT `news_attachments_newsId_fkey` FOREIGN KEY (`newsId`) REFERENCES `news`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
