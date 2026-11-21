-- Fix for 20261121090000_announce_task_line: it used CURRENT_TIMESTAMP, which is the server's local time
-- (UTC+7), but Prisma stores and reads DateTime as UTC. The post therefore looked scheduled 7 hours ahead
-- and was hidden. Publish it now (in UTC); only rows still in the future are touched.
UPDATE `news`
SET `publishedAt` = UTC_TIMESTAMP(3)
WHERE `id` LIKE 'tasklinenews%' AND `publishedAt` > UTC_TIMESTAMP(3);

-- Keep the pictures' order (createdAt asc) and put their times in UTC too.
UPDATE `news_attachments`
SET `createdAt` = UTC_TIMESTAMP(3) + INTERVAL CAST(SUBSTRING(`id`, 12, 1) AS UNSIGNED) SECOND
WHERE `id` LIKE 'tasklinefig%' AND `createdAt` > UTC_TIMESTAMP(3);
