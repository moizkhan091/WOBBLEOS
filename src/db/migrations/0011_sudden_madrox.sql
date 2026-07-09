ALTER TABLE "memory_chunks" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "importance" integer DEFAULT 0 NOT NULL;