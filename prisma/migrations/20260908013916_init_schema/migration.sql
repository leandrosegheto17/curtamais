-- CreateEnum
CREATE TYPE "TripEntryPath" AS ENUM ('data_livre', 'feriado', 'quiz');

-- CreateEnum
CREATE TYPE "TripSessionStatus" AS ENUM ('in_progress', 'partial', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "DestinationSource" AS ENUM ('ia_suggested', 'user_provided');

-- CreateEnum
CREATE TYPE "ItineraryPeriod" AS ENUM ('manha', 'tarde', 'noite');

-- CreateEnum
CREATE TYPE "LlmStage" AS ENUM ('destino', 'hospedagem', 'passeios', 'roteiro');

-- CreateEnum
CREATE TYPE "LlmGenerationStatus" AS ENUM ('success', 'failed_after_retry');

-- CreateTable
CREATE TABLE "trip_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "entry_path" "TripEntryPath" NOT NULL,
    "date_range_start" DATE,
    "date_range_end" DATE NOT NULL,
    "budget_amount" DECIMAL(10,2),
    "budget_currency" TEXT,
    "status" "TripSessionStatus" NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination_approvals" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "justification" TEXT,
    "price_range_min" DECIMAL(10,2) NOT NULL,
    "price_range_max" DECIMAL(10,2) NOT NULL,
    "source" "DestinationSource" NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destination_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_approvals" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "price_per_night_min" DECIMAL(10,2) NOT NULL,
    "price_per_night_max" DECIMAL(10,2) NOT NULL,
    "distinctive_feature" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accommodation_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_approvals" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_min" DECIMAL(10,2) NOT NULL,
    "price_max" DECIMAL(10,2) NOT NULL,
    "is_free" BOOLEAN NOT NULL,
    "duration_approx" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_items" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "activity_id" TEXT,
    "day_date" DATE NOT NULL,
    "period" "ItineraryPeriod" NOT NULL,
    "suggested_time" TEXT NOT NULL,
    "timing_justification" TEXT,
    "sequence_order" INTEGER NOT NULL,

    CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_generation_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "stage" "LlmStage" NOT NULL,
    "provider" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "tokens_input" INTEGER NOT NULL,
    "tokens_output" INTEGER NOT NULL,
    "cost_estimate_usd" DECIMAL(10,6) NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "retry_count" INTEGER NOT NULL,
    "status" "LlmGenerationStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_generation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "destination_approvals_session_id_key" ON "destination_approvals"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_approvals_session_id_key" ON "accommodation_approvals"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_items_activity_id_key" ON "itinerary_items"("activity_id");

-- AddForeignKey
ALTER TABLE "destination_approvals" ADD CONSTRAINT "destination_approvals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "trip_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_approvals" ADD CONSTRAINT "accommodation_approvals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "trip_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_approvals" ADD CONSTRAINT "activity_approvals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "trip_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "trip_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activity_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_generation_logs" ADD CONSTRAINT "llm_generation_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "trip_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
