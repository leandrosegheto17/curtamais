-- L11-T02a — ADR-008: persistência do dono da sessão anônima.
-- AlterTable
ALTER TABLE "trip_sessions" ADD COLUMN     "anon_session_id" TEXT;
