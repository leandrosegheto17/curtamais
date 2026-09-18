-- V2-L9-T01 — ADR-013 §5: marcação do checklist de bagagem (só código, sem texto livre).
-- CreateTable
CREATE TABLE "trip_checklist_marks" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "item_key" VARCHAR(64) NOT NULL,
    "checked" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_checklist_marks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_checklist_marks_session_id_item_key_key" ON "trip_checklist_marks"("session_id", "item_key");

-- AddForeignKey
ALTER TABLE "trip_checklist_marks" ADD CONSTRAINT "trip_checklist_marks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "trip_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


