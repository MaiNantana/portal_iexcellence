-- One HR URL can hold several databases: a member may link one HR account per database.
-- The orgId foreign key relies on the old unique index, so it is dropped and re-added around the swap.
ALTER TABLE `account_links` DROP FOREIGN KEY `account_links_orgId_fkey`;

DROP INDEX `account_links_orgId_userId_system_key` ON `account_links`;

ALTER TABLE `account_links` ADD COLUMN `externalDb` VARCHAR(191) NOT NULL DEFAULT '';

-- Existing HR links: the database is the 2nd part of the HR token "user|db|port|server".
UPDATE `account_links` SET `externalDb` = SUBSTRING_INDEX(SUBSTRING_INDEX(`externalUserId`, '|', 2), '|', -1) WHERE `system` = 'HR';

CREATE UNIQUE INDEX `account_links_orgId_userId_system_externalDb_key` ON `account_links`(`orgId`, `userId`, `system`, `externalDb`);

ALTER TABLE `account_links` ADD CONSTRAINT `account_links_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `orgs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
