ALTER TABLE `article`
  ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN `reviewDecision` VARCHAR(32) NULL,
  ADD COLUMN `riskLevel` VARCHAR(32) NULL,
  ADD COLUMN `reviewReason` VARCHAR(512) NULL,
  ADD COLUMN `reviewSuggestion` VARCHAR(512) NULL,
  ADD COLUMN `reviewedAt` DATETIME(3) NULL;

CREATE INDEX `article_status_posttime_idx` ON `article`(`status`, `posttime`);

CREATE TABLE IF NOT EXISTS `notification` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` VARCHAR(512) NULL,
  `actorId` INT NULL,
  `articleId` INT NULL,
  `commentId` INT NULL,
  `link` VARCHAR(512) NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `notification_user_created_idx` (`userId`, `createdAt`),
  INDEX `notification_user_read_created_idx` (`userId`, `readAt`, `createdAt`),
  INDEX `notification_type_created_idx` (`type`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
