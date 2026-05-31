CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('CITIZEN', 'ENTITY', 'POLITICIAN', 'COMPANY', 'PRESS', 'NGO', 'RESEARCHER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'DISPUTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'RESPONDED', 'STATUS_CHANGED', 'UPDATE', 'DISPUTED', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('HEALTH', 'MOBILITY', 'SAFETY', 'EDUCATION', 'SANITATION', 'HOUSING', 'ENVIRONMENT', 'INFRASTRUCTURE', 'URBAN_SERVICES', 'CORRUPTION', 'ACCESSIBILITY', 'SOCIAL_WELFARE', 'OTHER');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('CITY_HALL', 'HOSPITAL', 'CONCESSIONAIRE', 'AUTARCHY', 'SECRETARIAT', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanySector" AS ENUM ('TELECOM', 'SUPPLEMENTAL_HEALTH', 'FINANCIAL', 'ENERGY', 'TRANSPORTATION', 'RETAIL', 'FOOD', 'CONDOMINIUM', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanySize" AS ENUM ('MEI', 'SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "CompanyPlan" AS ENUM ('STARTER', 'BUSINESS', 'ENTERPRISE', 'WHITE_LABEL');

-- CreateEnum
CREATE TYPE "EntityPlan" AS ENUM ('BASICO', 'GESTAO', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "PoliticianPlan" AS ENUM ('BASICO', 'MANDATOMETRO_PRO', 'CAMPANHA');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('ENTITY', 'COMPANY', 'BRANCH', 'POLITICIAN');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('SUPPORT', 'ME_TOO');

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('ENTITY', 'POLITICIAN', 'COMPANY');

-- CreateEnum
CREATE TYPE "OrgPermission" AS ENUM ('RESPOND_REPORTS', 'MANAGE_MEMBERS', 'MANAGE_PROFILE', 'VIEW_ANALYTICS', 'EXPORT_DATA', 'MANAGE_BRANCHES');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RegistrationRequestType" AS ENUM ('ENTITY', 'POLITICIAN', 'COMPANY');

-- CreateEnum
CREATE TYPE "RegistrationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_COMMENT', 'STATUS_CHANGED', 'SURTO_DETECTED');

-- CreateEnum
CREATE TYPE "ApiKeyTier" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "FollowerActorType" AS ENUM ('POLITICIAN', 'ENTITY');

-- CreateEnum
CREATE TYPE "PropostaStatus" AS ENUM ('DRAFT', 'PRESENTED', 'IN_VOTE', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PropostaEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'UPDATED');

-- CreateEnum
CREATE TYPE "CommentMediaType" AS ENUM ('TEXT', 'AUDIO', 'VIDEO');

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
    "zipCode" TEXT,
    "street" TEXT,
    "streetNumber" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "googleId" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaBackupCodes" TEXT[],
    "lastLoginAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "emailVerificationToken" TEXT,
    "emailVerificationExpires" TIMESTAMP(3),
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
    "embedding" vector(768),
    "recipientType" "RecipientType",
    "recipientId" TEXT,
    "authorId" TEXT,
    "groupId" TEXT,
    "surtoId" TEXT,
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
    "createdByUserId" TEXT,
    "legalName" TEXT NOT NULL,
    "cnpj" TEXT,
    "ibgeCode" TEXT,
    "type" "EntityType" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "votzScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plan" "EntityPlan" NOT NULL DEFAULT 'BASICO',
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
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "politicians" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "cpf" TEXT,
    "tseId" TEXT,
    "partyId" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "termStart" TIMESTAMP(3) NOT NULL,
    "termEnd" TIMESTAMP(3) NOT NULL,
    "electoralZone" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT,
    "avatarUrl" TEXT,
    "website" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "plan" "PoliticianPlan" NOT NULL DEFAULT 'BASICO',
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
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "reportId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_requests" (
    "id" TEXT NOT NULL,
    "type" "RegistrationRequestType" NOT NULL,
    "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "claimTargetId" TEXT,
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "approvedOrgId" TEXT,
    "approvedOrgType" "OrgType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "mediaType" "CommentMediaType" NOT NULL DEFAULT 'TEXT',
    "mediaUrl" TEXT,
    "mediaKey" TEXT,
    "mediaDuration" INTEGER,
    "transcript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_roles" (
    "id" TEXT NOT NULL,
    "orgType" "OrgType" NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" "OrgPermission"[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgType" "OrgType" NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surtos" (
    "id" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_followers" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorType" "FollowerActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_followers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "tier" "ApiKeyTier" NOT NULL DEFAULT 'FREE',
    "userId" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_invites" (
    "id" TEXT NOT NULL,
    "orgType" "OrgType" NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propostas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "PropostaStatus" NOT NULL DEFAULT 'DRAFT',
    "categorias" "Category"[],
    "linkExterno" TEXT,
    "politicoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "propostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_timeline" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "tipo" "PropostaEventType" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "autorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposta_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_votos" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "apoio" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposta_votos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerificationToken_key" ON "users"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "entities_cnpj_key" ON "entities"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "entities_ibgeCode_key" ON "entities"("ibgeCode");

-- CreateIndex
CREATE UNIQUE INDEX "parties_abbreviation_key" ON "parties"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "parties_number_key" ON "parties"("number");

-- CreateIndex
CREATE UNIQUE INDEX "politicians_cpf_key" ON "politicians"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "politicians_tseId_key" ON "politicians"("tseId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_cnpj_key" ON "companies"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "votes_reportId_userId_type_key" ON "votes"("reportId", "userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "org_roles_orgType_orgId_name_key" ON "org_roles"("orgType", "orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "org_memberships_userId_orgType_orgId_key" ON "org_memberships"("userId", "orgType", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "surtos_category_city_key" ON "surtos"("category", "city");

-- CreateIndex
CREATE INDEX "report_followers_actorType_actorId_idx" ON "report_followers"("actorType", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "report_followers_reportId_actorType_actorId_key" ON "report_followers"("reportId", "actorType", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_invites_token_key" ON "member_invites"("token");

-- CreateIndex
CREATE UNIQUE INDEX "proposta_votos_propostaId_usuarioId_key" ON "proposta_votos"("propostaId", "usuarioId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "report_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_surtoId_fkey" FOREIGN KEY ("surtoId") REFERENCES "surtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "politicians" ADD CONSTRAINT "politicians_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "org_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_followers" ADD CONSTRAINT "report_followers_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_politicoId_fkey" FOREIGN KEY ("politicoId") REFERENCES "politicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_timeline" ADD CONSTRAINT "proposta_timeline_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_timeline" ADD CONSTRAINT "proposta_timeline_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_votos" ADD CONSTRAINT "proposta_votos_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_votos" ADD CONSTRAINT "proposta_votos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
