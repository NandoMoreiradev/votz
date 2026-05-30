-- CreateEnum
CREATE TYPE "PropostaStatus" AS ENUM ('DRAFT', 'PRESENTED', 'IN_VOTE', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PropostaEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'UPDATED');

-- DropIndex (IF EXISTS — esses índices são criados manualmente fora das migrations)
DROP INDEX IF EXISTS "reports_description_trgm_idx";
DROP INDEX IF EXISTS "reports_embedding_hnsw_idx";
DROP INDEX IF EXISTS "reports_search_vector_gin_idx";
DROP INDEX IF EXISTS "reports_title_trgm_idx";

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
CREATE UNIQUE INDEX "proposta_votos_propostaId_usuarioId_key" ON "proposta_votos"("propostaId", "usuarioId");

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
