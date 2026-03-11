CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"start_page" integer NOT NULL,
	"end_page" integer NOT NULL,
	"minio_input_path" varchar(512),
	"minio_result_path" varchar(512),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"result_md" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"file_size" bigint NOT NULL,
	"page_count" integer,
	"minio_path" varchar(512) NOT NULL,
	"status" varchar(50) DEFAULT 'uploaded' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engine_type" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"base_url" varchar(512) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"engine_type" varchar(50) NOT NULL,
	"server_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_chunks" integer,
	"completed_chunks" integer DEFAULT 0 NOT NULL,
	"failed_chunks" integer DEFAULT 0 NOT NULL,
	"error_report" text,
	"result_minio_path" varchar(512),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_task_id_extraction_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."extraction_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_tasks" ADD CONSTRAINT "extraction_tasks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_tasks" ADD CONSTRAINT "extraction_tasks_server_id_engine_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."engine_servers"("id") ON DELETE no action ON UPDATE no action;