CREATE TABLE IF NOT EXISTS "export_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_email" text,
  "course_id" text NOT NULL,
  "course_name" text NOT NULL,
  "target_folder_id" text,
  "status" text NOT NULL DEFAULT 'pending',
  "total_files" integer DEFAULT 0 NOT NULL,
  "copied_files" integer DEFAULT 0 NOT NULL,
  "skipped_files" integer DEFAULT 0 NOT NULL,
  "failed_files" integer DEFAULT 0 NOT NULL,
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
 FOREIGN KEY ("export_id") REFERENCES "public"."export_jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "user_email_idx" ON "export_jobs" ("user_email");
CREATE INDEX IF NOT EXISTS "status_idx" ON "export_jobs" ("status");
CREATE INDEX IF NOT EXISTS "created_at_idx" ON "export_jobs" ("created_at");
CREATE INDEX IF NOT EXISTS "course_id_idx" ON "export_jobs" ("course_id");
CREATE INDEX IF NOT EXISTS "export_id_idx" ON "export_logs" ("export_id");
