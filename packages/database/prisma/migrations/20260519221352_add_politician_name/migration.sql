-- AlterTable: politicians — add name field for independent identity
ALTER TABLE "politicians" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
