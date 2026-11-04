-- Production database for the Portal on the shared MariaDB (hr.iexcellence.cloud:3307).
-- Run once as an admin user. Replace <STRONG_PASSWORD> and <PORTAL_SERVER_IP> first.
-- The Portal gets its OWN user, limited to its OWN database; it never uses root
-- and can't read TaskExcellence's tables.
CREATE DATABASE IF NOT EXISTS portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'portal'@'<PORTAL_SERVER_IP>' IDENTIFIED BY '<STRONG_PASSWORD>';
GRANT ALL PRIVILEGES ON portal.* TO 'portal'@'<PORTAL_SERVER_IP>';
FLUSH PRIVILEGES;
