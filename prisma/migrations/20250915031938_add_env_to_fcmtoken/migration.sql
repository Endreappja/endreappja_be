/*
  Warnings:

  - Added the required column `env` to the `FcmToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `FcmToken` ADD COLUMN `env` VARCHAR(191) NOT NULL;
