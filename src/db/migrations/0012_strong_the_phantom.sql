CREATE TABLE "knowledge_note_links" (
	"id" text PRIMARY KEY NOT NULL,
	"from_note_id" text NOT NULL,
	"to_note_id" text NOT NULL,
	"link_type" varchar(40) DEFAULT 'relates_to' NOT NULL,
	"confidence" numeric,
	"created_by" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note_type" varchar(40) NOT NULL,
	"topic" varchar(160) NOT NULL,
	"area" varchar(80) NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"confidence" numeric,
	"trust_level" varchar(48) DEFAULT 'experimental' NOT NULL,
	"embedding" vector(1536),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"superseded_by_note_id" text,
	"times_reinforced" integer DEFAULT 0 NOT NULL,
	"bank_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" varchar(120),
	"last_compiled_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "knowledge_note_links_from_idx" ON "knowledge_note_links" USING btree ("from_note_id");--> statement-breakpoint
CREATE INDEX "knowledge_note_links_to_idx" ON "knowledge_note_links" USING btree ("to_note_id");--> statement-breakpoint
CREATE INDEX "knowledge_note_links_type_idx" ON "knowledge_note_links" USING btree ("link_type");--> statement-breakpoint
CREATE INDEX "knowledge_notes_source_id_idx" ON "knowledge_notes" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_notes_note_type_idx" ON "knowledge_notes" USING btree ("note_type");--> statement-breakpoint
CREATE INDEX "knowledge_notes_topic_idx" ON "knowledge_notes" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "knowledge_notes_status_idx" ON "knowledge_notes" USING btree ("status");--> statement-breakpoint
--> HNSW index for fast cosine similarity over compiled-note embeddings (hand-added; drizzle
--> does not emit vector indexes). Mirrors the memory_chunks embedding index.
CREATE INDEX IF NOT EXISTS "knowledge_notes_embedding_hnsw" ON "knowledge_notes" USING hnsw ("embedding" vector_cosine_ops);