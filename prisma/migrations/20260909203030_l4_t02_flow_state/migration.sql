-- CreateEnum
CREATE TYPE "SessionFlowState" AS ENUM ('entrada_selecionada', 'destino_pendente', 'destino_confirmado', 'hospedagem_pendente', 'hospedagem_aprovada', 'passeios_pendente', 'passeios_aprovados', 'roteiro_pendente', 'roteiro_aprovado', 'concluida', 'encerrada_parcial');

-- AlterTable
ALTER TABLE "trip_sessions" ADD COLUMN     "flow_state" "SessionFlowState" NOT NULL DEFAULT 'entrada_selecionada';
