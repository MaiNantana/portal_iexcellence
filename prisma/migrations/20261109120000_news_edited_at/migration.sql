-- Set when an admin changes a post's title or body.
ALTER TABLE `news` ADD COLUMN `editedAt` DATETIME(3) NULL;
