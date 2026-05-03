/*
  Warnings:

  - Added the required column `tag` to the `Article` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `article` ADD COLUMN `tag` VARCHAR(191) NOT NULL;
