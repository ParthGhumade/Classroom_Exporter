import { supabase } from "./supabase";

export interface ExportJob {
  id: number;
  courseId: string;
  courseName: string;
  userEmail?: string | null;
  targetFolderId?: string | null;
  mode: "drive" | "zip";
  status: "pending" | "running" | "completed" | "failed";
  totalFiles: number;
  copiedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  createdAt: string;
  updatedAt: string;
  logs?: ExportLog[];
}

export interface ExportLog {
  id: string;
  exportId: number;
  level: "info" | "success" | "warning" | "error";
  message: string;
  fileId?: string | null;
  fileName?: string | null;
  sourceName?: string | null;
  copiedFileId?: string | null;
  createdAt: string;
}

const JOBS_STORAGE_KEY = "classroom_exporter_jobs";

function getLocalJobs(): ExportJob[] {
  try {
    const raw = localStorage.getItem(JOBS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalJobs(jobs: ExportJob[]) {
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
}

function getLocalLogs(exportId: number): ExportLog[] {
  try {
    const raw = localStorage.getItem(`classroom_export_logs_${exportId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function appendLocalLog(exportId: number, log: ExportLog) {
  const logs = getLocalLogs(exportId);
  logs.push(log);
  // Keep last 1000 logs in local storage
  if (logs.length > 1000) logs.splice(0, logs.length - 1000);
  localStorage.setItem(`classroom_export_logs_${exportId}`, JSON.stringify(logs));
}

export async function createExportJob(params: {
  courseId: string;
  courseName: string;
  mode: "drive" | "zip";
  userEmail?: string | null;
}): Promise<ExportJob> {
  const newId = Date.now();
  const now = new Date().toISOString();
  const job: ExportJob = {
    id: newId,
    courseId: params.courseId,
    courseName: params.courseName,
    userEmail: params.userEmail || null,
    mode: params.mode,
    status: "pending",
    totalFiles: 0,
    copiedFiles: 0,
    skippedFiles: 0,
    failedFiles: 0,
    createdAt: now,
    updatedAt: now,
    logs: [],
  };

  const jobs = getLocalJobs();
  jobs.unshift(job);
  setLocalJobs(jobs);

  if (supabase) {
    try {
      await supabase.from("export_jobs").insert({
        id: job.id,
        course_id: job.courseId,
        course_name: job.courseName,
        user_email: job.userEmail,
        status: job.status,
        total_files: 0,
        copied_files: 0,
        skipped_files: 0,
        failed_files: 0,
      });
    } catch (err) {
      console.warn("Supabase insert error (using local storage):", err);
    }
  }

  return job;
}

export async function updateExportJob(
  id: number,
  fields: Partial<ExportJob>
): Promise<void> {
  const jobs = getLocalJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx !== -1) {
    jobs[idx] = {
      ...jobs[idx],
      ...fields,
      updatedAt: new Date().toISOString(),
    };
    setLocalJobs(jobs);
  }

  if (supabase) {
    try {
      const dbFields: Record<string, any> = { updated_at: new Date().toISOString() };
      if (fields.status) dbFields.status = fields.status;
      if (fields.totalFiles !== undefined) dbFields.total_files = fields.totalFiles;
      if (fields.copiedFiles !== undefined) dbFields.copied_files = fields.copiedFiles;
      if (fields.skippedFiles !== undefined) dbFields.skipped_files = fields.skippedFiles;
      if (fields.failedFiles !== undefined) dbFields.failed_files = fields.failedFiles;
      if (fields.targetFolderId !== undefined) dbFields.target_folder_id = fields.targetFolderId;

      await supabase.from("export_jobs").update(dbFields).eq("id", id);
    } catch (err) {
      console.warn("Supabase update error:", err);
    }
  }
}

export async function addExportLog(
  exportId: number,
  level: "info" | "success" | "warning" | "error",
  message: string,
  extra?: {
    fileId?: string;
    fileName?: string;
    sourceName?: string;
    copiedFileId?: string;
  }
): Promise<ExportLog> {
  const log: ExportLog = {
    id: `${exportId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    exportId,
    level,
    message,
    fileId: extra?.fileId || null,
    fileName: extra?.fileName || null,
    sourceName: extra?.sourceName || null,
    copiedFileId: extra?.copiedFileId || null,
    createdAt: new Date().toISOString(),
  };

  appendLocalLog(exportId, log);

  if (supabase) {
    try {
      await supabase.from("export_logs").insert({
        export_id: exportId,
        level,
        message,
        file_id: log.fileId,
        file_name: log.fileName,
        source_name: log.sourceName,
        copied_file_id: log.copiedFileId,
      });
    } catch {
      // Silently continue with local storage
    }
  }

  return log;
}

export async function getExportJob(id: number): Promise<ExportJob | null> {
  const jobs = getLocalJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) return null;

  const logs = getLocalLogs(id);
  return { ...job, logs };
}

export async function listExportJobs(): Promise<ExportJob[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("export_jobs")
        .select()
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error && data) {
        return data.map((d: any) => ({
          id: d.id,
          courseId: d.course_id,
          courseName: d.course_name,
          userEmail: d.user_email,
          targetFolderId: d.target_folder_id,
          mode: "drive",
          status: d.status,
          totalFiles: d.total_files,
          copiedFiles: d.copied_files,
          skippedFiles: d.skipped_files,
          failedFiles: d.failed_files,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch {
      // Fallback to local storage
    }
  }

  return getLocalJobs();
}
