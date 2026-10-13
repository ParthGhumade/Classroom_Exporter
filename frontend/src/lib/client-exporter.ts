import { discoverCourseFiles, extractAuthUser, type DriveFileRef } from "./google-classroom";
import {
  updateExportJob,
  addExportLog,
  getExportJob,
  type ExportJob,
} from "./storage";

export type ProgressCallback = (job: ExportJob) => void;

export interface BatchDownloadItem {
  id: string;
  name?: string;
  sourceName?: string;
  alternateLink?: string | null;
  authUser?: string | null;
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolves the Google Drive preview/export URL.
 * Wraps the base file URL with Google's official AccountChooser endpoint if userEmail is provided,
 * forcing the browser to use the logged-in email session and avoiding 403 Forbidden errors.
 */
export function getGoogleDriveDownloadUrl(
  fileId: string,
  alternateLink?: string | null,
  userEmail?: string | null
): string {
  const baseFileUrl =
    alternateLink && alternateLink.startsWith("http")
      ? alternateLink
      : `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;

  if (userEmail && userEmail.trim() !== "") {
    return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(
      userEmail.trim()
    )}&continue=${encodeURIComponent(baseFileUrl)}`;
  }

  return baseFileUrl;
}

/**
 * Result of attempting to trigger a browser open via window.open.
 */
export interface DownloadTriggerResult {
  success: boolean;
  popupBlocked: boolean;
  windowRef: Window | null;
}

/**
 * Opens a Google Drive file preview/download tab via window.open(targetUrl, '_blank').
 * Wraps with Google's official AccountChooser to force the browser to use the logged-in email session.
 * Detects browser popup blocker interference.
 */
export function triggerBrowserDownload(
  fileId: string,
  fileName?: string,
  alternateLink?: string | null,
  userEmail?: string | null
): DownloadTriggerResult {
  if (typeof window === "undefined") {
    return { success: false, popupBlocked: false, windowRef: null };
  }

  const baseFileUrl =
    alternateLink && alternateLink.startsWith("http")
      ? alternateLink
      : `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;

  // Wrap with Google's official AccountChooser to force the browser to use the logged-in email session
  const targetUrl =
    userEmail && userEmail.trim() !== ""
      ? `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(
          userEmail.trim()
        )}&continue=${encodeURIComponent(baseFileUrl)}`
      : baseFileUrl;

  try {
    const newWindow = window.open(targetUrl, "_blank");

    if (!newWindow || newWindow.closed || typeof newWindow.closed === "undefined") {
      // POPUP BLOCKED!
      return { success: false, popupBlocked: true, windowRef: null };
    }

    return { success: true, popupBlocked: false, windowRef: newWindow };
  } catch {
    return { success: false, popupBlocked: true, windowRef: null };
  }
}

export interface BatchDownloadOptions {
  delayMs?: number;
  userEmail?: string | null;
  onProgress?: (index: number, file: BatchDownloadItem) => Promise<void> | void;
  onPopupBlocked?: (index: number, file: BatchDownloadItem) => Promise<void> | void;
}

export interface BatchDownloadResult {
  completed: number;
  total: number;
  popupBlocked: boolean;
  blockedIndex?: number;
}

/**
 * Sequentially opens Google Drive preview tabs using window.open with a 1500ms delay.
 * Passes the targetUrl wrapped with Google AccountChooser for the user's logged-in email.
 * Detects popup blocker interference and immediately pauses the loop.
 */
export async function batchDownloadFiles(
  files: BatchDownloadItem[],
  optionsOrDelayMs: number | BatchDownloadOptions = 1500,
  onProgressLegacy?: (index: number, file: BatchDownloadItem) => Promise<void> | void
): Promise<BatchDownloadResult> {
  const options: BatchDownloadOptions =
    typeof optionsOrDelayMs === "number"
      ? { delayMs: optionsOrDelayMs, onProgress: onProgressLegacy }
      : optionsOrDelayMs;

  const delayMs = options.delayMs ?? 1500;
  const userEmail = options.userEmail;
  const onProgress = options.onProgress;
  const onPopupBlocked = options.onPopupBlocked;

  let completed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const targetUrl = file.alternateLink;
    const result = triggerBrowserDownload(file.id, file.name, targetUrl, userEmail);

    if (result.popupBlocked) {
      if (onPopupBlocked) {
        await onPopupBlocked(i, file);
      }
      return {
        completed,
        total: files.length,
        popupBlocked: true,
        blockedIndex: i,
      };
    }

    completed++;
    if (onProgress) {
      await onProgress(i, file);
    }

    if (i < files.length - 1) {
      await delay(delayMs);
    }
  }

  return {
    completed,
    total: files.length,
    popupBlocked: false,
  };
}

/**
 * Runs client-side direct batch download.
 * Discovers course files via the Google Classroom API and triggers sequential
 * browser downloads directly using Google Drive session cookies.
 */
export async function runDirectDownload(
  jobId: number,
  courseId: string,
  courseName: string,
  accessToken: string,
  onProgress?: ProgressCallback,
  selectedFileIds?: string[],
  onPopupBlocked?: () => void,
  userEmail?: string | null
): Promise<BatchDownloadResult> {
  const notify = async (fields: Partial<ExportJob>) => {
    await updateExportJob(jobId, fields);
    if (onProgress) {
      const updated = await getExportJob(jobId);
      if (updated) onProgress(updated);
    }
  };

  // Screen Wake Lock to keep devices awake during export
  let wakeLock: any = null;
  if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
    try {
      wakeLock = await (navigator as any).wakeLock.request("screen");
    } catch {
      // Wake lock not allowed or unsupported
    }
  }

  try {
    await notify({ status: "running" });
    await addExportLog(jobId, "info", `Starting direct download for "${courseName}"...`);

    const allFiles = await discoverCourseFiles(accessToken, courseId);
    const files = selectedFileIds
      ? allFiles.filter((f) => selectedFileIds.includes(f.id))
      : allFiles;
    const total = files.length;
    await notify({ totalFiles: total });

    if (total === 0) {
      await addExportLog(jobId, "warning", "No downloadable Drive files selected for this course.");
      await notify({ status: "completed" });
      return { completed: 0, total: 0, popupBlocked: false };
    }

    await addExportLog(
      jobId,
      "info",
      `Discovered ${total} files. Starting sequential browser export (1500ms delay between files)...`
    );

    let downloaded = 0;
    let failed = 0;

    const result = await batchDownloadFiles(files, {
      delayMs: 1500,
      userEmail,
      onProgress: async (index, file) => {
        downloaded++;
        await notify({ copiedFiles: downloaded, failedFiles: failed });
        await addExportLog(
          jobId,
          "success",
          `Triggered download (${index + 1}/${total}): ${file.name || file.id}`,
          {
            fileId: file.id,
            fileName: file.name,
            sourceName: file.sourceName,
          }
        );
      },
      onPopupBlocked: async (index, file) => {
        await addExportLog(
          jobId,
          "error",
          `⚠️ Downloads Paused: Browser popup blocker blocked window.open for "${file.name || file.id}" at file ${index + 1}/${total}.`,
          {
            fileId: file.id,
            fileName: file.name,
            sourceName: file.sourceName,
          }
        );
        if (onPopupBlocked) {
          onPopupBlocked();
        }
      },
    });

    if (result.popupBlocked) {
      await notify({
        status: "failed",
        copiedFiles: downloaded,
        failedFiles: failed,
      });
      return result;
    }

    await notify({
      status: "completed",
      copiedFiles: downloaded,
      failedFiles: failed,
    });
    await addExportLog(
      jobId,
      "success",
      `Batch download complete! Triggered ${downloaded} downloads to your local device.`
    );
    return result;
  } catch (err: any) {
    await notify({ status: "failed" });
    await addExportLog(
      jobId,
      "error",
      `Export encountered an error: ${err.message || String(err)}`
    );
    return { completed: 0, total: 0, popupBlocked: false };
  } finally {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
    }
  }
}

// Backward-compatibility aliases for existing calls
export const runBatchDownload = runDirectDownload;
export const runDriveExport = runDirectDownload;
export const runZipDownload = runDirectDownload;
