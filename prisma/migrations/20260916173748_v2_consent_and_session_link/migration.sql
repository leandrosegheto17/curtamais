-- V2-L1-T01 — ADR-009/ADR-012: consentimento LGPD no cadastro e vínculo de
-- sessão anônima a conta.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "privacy_consent_at" TIMESTAMP(3),
ADD COLUMN     "privacy_consent_version" TEXT;

-- AlterTable
ALTER TABLE "trip_sessions" ADD COLUMN     "linked_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "trip_sessions_user_id_updated_at_idx" ON "trip_sessions"("user_id", "updated_at");
