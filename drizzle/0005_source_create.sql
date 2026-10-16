ALTER TABLE "proposals" DROP CONSTRAINT "proposals_kind_check";--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_kind_check" CHECK ("kind" in ('note_update', 'link_create', 'link_delete', 'note_merge', 'bulk_organize', 'moc_update', 'source_create'));
