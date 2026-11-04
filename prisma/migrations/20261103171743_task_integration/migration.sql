-- AlterTable
ALTER TABLE `orgs` ADD COLUMN `taskApiKeyEnc` TEXT NULL,
    ADD COLUMN `taskApiKeyHint` VARCHAR(191) NULL,
    ADD COLUMN `taskApiUrl` TEXT NULL;
