-- Supabase Schema Migration for Classroom Exporter
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor)

-- 1. Create export_jobs table
CREATE TABLE IF NOT EXISTS public.export_jobs (
  id BIGINT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  target_folder_id TEXT,
  mode TEXT NOT NULL DEFAULT 'drive' CHECK (mode IN ('drive', 'zip')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_files INTEGER NOT NULL DEFAULT 0,
  copied_files INTEGER NOT NULL DEFAULT 0,
  skipped_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create export_logs table
CREATE TABLE IF NOT EXISTS public.export_logs (
  id BIGSERIAL PRIMARY KEY,
  export_id BIGINT NOT NULL REFERENCES public.export_jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'success', 'warning', 'error')),
  message TEXT NOT NULL,
  file_id TEXT,
  file_name TEXT,
  source_name TEXT,
  copied_file_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_export_jobs_user_email ON public.export_jobs (user_email);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON public.export_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON public.export_jobs (status);
CREATE INDEX IF NOT EXISTS idx_export_logs_export_id ON public.export_logs (export_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Allow users to manage their own jobs (by user_id or email)
CREATE POLICY "Users can view their own export jobs"
  ON public.export_jobs FOR SELECT
  USING (
    auth.uid() = user_id OR
    (auth.jwt() ->> 'email') = user_email OR
    auth.role() = 'anon'
  );

CREATE POLICY "Users can insert their own export jobs"
  ON public.export_jobs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR
    (auth.jwt() ->> 'email') = user_email OR
    auth.role() = 'anon'
  );

CREATE POLICY "Users can update their own export jobs"
  ON public.export_jobs FOR UPDATE
  USING (
    auth.uid() = user_id OR
    (auth.jwt() ->> 'email') = user_email OR
    auth.role() = 'anon'
  );

-- Allow users to view logs for their own jobs
CREATE POLICY "Users can view logs for their export jobs"
  ON public.export_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.export_jobs
      WHERE public.export_jobs.id = public.export_logs.export_id
      AND (
        public.export_jobs.user_id = auth.uid() OR
        public.export_jobs.user_email = (auth.jwt() ->> 'email') OR
        auth.role() = 'anon'
      )
    )
  );

CREATE POLICY "Users can insert logs for their export jobs"
  ON public.export_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.export_jobs
      WHERE public.export_jobs.id = public.export_logs.export_id
    )
  );
