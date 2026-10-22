CREATE TABLE "note_sources" (
  "note_id" text NOT NULL,
  "raw_id" text NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "note_sources_note_id_raw_id_pk" PRIMARY KEY("note_id", "raw_id"),
  CONSTRAINT "note_sources_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "note_sources_raw_id_raw_notes_id_fk" FOREIGN KEY ("raw_id") REFERENCES "public"."raw_notes"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "note_sources_user_id_idx" ON "note_sources" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "note_sources_raw_id_idx" ON "note_sources" USING btree ("raw_id");
--> statement-breakpoint
INSERT INTO "note_sources" ("note_id", "raw_id", "user_id", "created_at")
SELECT "id", "raw_id", "user_id", "created_at" FROM "notes"
ON CONFLICT ("note_id", "raw_id") DO NOTHING;
