ALTER TABLE "notes" ADD COLUMN "confidence" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "stale_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_confidence_check" CHECK ("confidence" in ('low', 'medium', 'high'));--> statement-breakpoint
UPDATE "notes" SET "stale_after" = "updated_at" + interval '90 days' WHERE "stale_after" IS NULL;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "evidence" text;--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT "links_type_check";--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_type_check" CHECK ("type" in ('related', 'supports', 'contradicts', 'example', 'prerequisite'));
