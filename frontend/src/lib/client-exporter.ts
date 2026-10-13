import { discoverCourseFiles, type DriveFileRef } from "./google-classroom";
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
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Constructs the native Google Drive direct download URL.
 * Relies on the user's active Google session cookies in the browser,
 * avoiding the need for restricted Google Drive OAuth scopes.
 */
export function getGoogleDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Triggers a file download via a dynamically created DOM anchor element.
 */
export function triggerBrowserDownload(fileId: string, fileName?: string): void {
  const url = getGoogleDriveDownloadUrl(fileId);
  const a = document.createElement("a");
  a.href = url;
  if (fileName) {
    a.setAttribute("download", fileName);
  }
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Sequentially triggers browser downloads with a delay (default 1500ms)
 * between each file to prevent the browser from blocking simultaneous
 * downloads as pop-up spam.
 */
export async function batchDownloadFiles(
  files: BatchDownloadItem[],
  delayMs = 1500,
  onProgress?: (index: number, file: BatchDownloadItem) => Promise<void> | void
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    triggerBrowserDownload(file.id, file.name);
    if (onProgress) {
      await onProgress(i, file);
    }
    if (i < files.length - 1) {
      await delay(delayMs);
    }
  }
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
  selectedFileIds?: string[]
): Promise<void> {
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
      return;
    }

    await addExportLog(
      jobId,
      "info",
      `Discovered ${total} files. Starting sequential browser download (1.5s delay between files)...`
    );

    let downloaded = 0;
    let failed = 0;

    await batchDownloadFiles(files, 1500, async (index, file) => {
      try {
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
      } catch (err: any) {
        failed++;
        await notify({ copiedFiles: downloaded, failedFiles: failed });
        await addExportLog(
          jobId,
          "error",
          `Failed to trigger download for "${file.name || file.id}": ${err.message || String(err)}`,
          { fileId: file.id, fileName: file.name, sourceName: file.sourceName }
        );
      }
    });

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
  } catch (err: any) {
    await notify({ status: "failed" });
    await addExportLog(
      jobId,
      "error",
      `Export encountered an error: ${err.message || String(err)}`
    );
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
