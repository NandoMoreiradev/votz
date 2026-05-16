-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('CITIZEN', 'ENTITY', 'POLITICIAN', 'PRESS', 'NGO', 'RESEARCHER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'DISPUTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'RESPONDED', 'STATUS_CHANGED', 'DISPUTED', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('HEALTH', 'MOBILITY', 'SAFETY', 'EDUCATION', 'SANITATION', 'HOUSING', 'OTHER');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('CITY_HALL', 'HOSPITAL', 'CONCESSIONAIRE', 'AUTARCHY', 'SECRETARIAT', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanySector" AS ENUM ('TELECOM', 'SUPPLEMENTAL_HEALTH', 'FINANCIAL', 'ENERGY', 'TRANSPORTATION', 'RETAIL', 'FOOD', 'CONDOMINIUM', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanySize" AS ENUM ('MEI', 'SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "CompanyPlan" AS ENUM ('STARTER', 'BUSINESS', 'ENTERPRISE', 'WHITE_LABEL');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('ENTITY', 'COMPANY', 'BRANCH', 'POLITICIAN');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('SUPPORT', 'ME_TOO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "type" "UserType" NOT NULL DEFAULT 'CITIZEN',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "reputation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "phone" TEXT,
    "cpf" TEXT,
    "googleId" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaBackupCodes" TEXT[],
    "lastLoginAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "normalizedAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "neighborhood" TEXT,
    "media" TEXT[],
    "pressureScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recipientType" "RecipientType",
    "recipientId" TEXT,
    "authorId" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_groups" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "votzScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "slaHours" JSONB,
    "city" TEXT,
    "state" TEXT,
    "logoUrl" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "politicians" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "termStart" TIMESTAMP(3) NOT NULL,
    "termEnd" TIMESTAMP(3) NOT NULL,
    "electoralZone" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "mandatometer" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "politicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "sector" "CompanySector" NOT NULL,
    "size" "CompanySize" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "plan" "CompanyPlan" NOT NULL DEFAULT 'STARTER',
    "votzScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "slaHours" INTEGER NOT NULL DEFAULT 48,
    "logoUrl" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VoteType" NOT NULL DEFAULT 'SUPPORT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "entities_userId_key" ON "entities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "entities_cnpj_key" ON "entities"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "politicians_userId_key" ON "politicians"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_cnpj_key" ON "companies"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "votes_reportId_userId_type_key" ON "votes"("reportId", "userId", "type");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "report_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "politicians" ADD CONSTRAINT "politicians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
