ALTER TABLE "note_revisions" ADD COLUMN "markdown" text;--> statement-breakpoint
ALTER TABLE "note_revisions" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "markdown" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "raw_notes" ADD COLUMN "markdown" text;--> statement-breakpoint
ALTER TABLE "raw_notes" ADD COLUMN "path" text;