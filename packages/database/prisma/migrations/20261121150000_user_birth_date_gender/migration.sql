-- Data de nascimento e gênero opcionais (plano de anúncios, decisão 3). Nunca públicos.
-- CreateEnum
CREATE TYPE "UserGender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "gender" "UserGender";

