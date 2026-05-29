CREATE TABLE IF NOT EXISTS "export_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "course_id" text NOT NULL,
  "course_name" text NOT NULL,
  "target_folder_id" text,
  "status" text NOT NULL DEFAULT 'pending',
  "total_files" integer,
  "copied_files" integer,
  "skipped_files" integer,
  "failed_files" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "export_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "export_id" integer NOT NULL,
  "level" text NOT NULL DEFAULT 'info',
  "message" text NOT NULL,
  "file_id" text,
  "file_name" text,
  "source_name" text,
  "copied_file_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "export_logs" ADD CONSTRAINT "export_logs_export_id_export_jobs_id_fk"
 FOREIGN KEY ("export_id") REFERENCES "public"."export_jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
