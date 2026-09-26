import { discoverCourseFiles, type DriveFileRef } from "./google-classroom";
import {
  createDriveFolder,
  listFolderFiles,
  copyOrShortcutDriveFile,
  fetchFileForZip,
} from "./google-drive";
import { downloadFilesAsZip, type ZipFileInput } from "./zip-streamer";
import {
  updateExportJob,
  addExportLog,
  getExportJob,
  type ExportJob,
} from "./storage";

export type ProgressCallback = (job: ExportJob) => void;

/**
 * Runs client-side Google Drive export.
 * Directly calls Google Drive API (Google-to-Google transfer).
 */
export async function runDriveExport(
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

  try {
    await notify({ status: "running" });
    await addExportLog(jobId, "info", `Starting export for "${courseName}"...`);

    // 1. Create root folder in Google Drive
    await addExportLog(jobId, "info", `Creating Drive folder "Classroom Export — ${courseName}"...`);
    const rootFolderId = await createDriveFolder(
      accessToken,
      `Classroom Export — ${courseName}`
    );
    await notify({ targetFolderId: rootFolderId });
    await addExportLog(jobId, "info", `Created root folder. ID: ${rootFolderId}`);

    // 2. Discover course files
    await addExportLog(jobId, "info", "Fetching course coursework, materials, and announcements...");
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
      `Discovered ${total} files. Organizing into assignment subfolders...`
    );

    // Group files by topic/assignment name
    const grouped = new Map<string, DriveFileRef[]>();
    for (const f of files) {
      const groupName = f.sourceName || "General Materials";
      if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
      }
      grouped.get(groupName)!.push(f);
    }

    let copied = 0;
    let skipped = 0;
    let failed = 0;

    // Cache created subfolder IDs
    const folderCache = new Map<string, string>();

    for (const [topicName, topicFiles] of grouped.entries()) {
      let topicFolderId = rootFolderId;

      // If more than 1 topic, create clean subfolders for organization
      if (grouped.size > 1) {
        if (!folderCache.has(topicName)) {
          try {
            const subId = await createDriveFolder(accessToken, topicName, rootFolderId);
            folderCache.set(topicName, subId);
            await addExportLog(jobId, "info", `Created subfolder "${topicName}"`);
          } catch {
            topicFolderId = rootFolderId;
          }
        }
        topicFolderId = folderCache.get(topicName) || rootFolderId;
      }

      // Check existing files in this folder
      const existing = await listFolderFiles(accessToken, topicFolderId);

      for (const file of topicFiles) {
        let destName = file.name;
        if (existing.has(destName)) {
          // Disambiguate duplicate name instead of dropping file
          const extMatch = destName.match(/(\.[^.]+)$/);
          const ext = extMatch ? extMatch[1] : "";
          const base = extMatch ? destName.slice(0, -ext.length) : destName;
          destName = `${base} (copy)${ext}`;
        }

        try {
          const result = await copyOrShortcutDriveFile(
            accessToken,
            file.id,
            destName,
            topicFolderId
          );
          existing.set(destName, result.id);
          copied++;

          if (result.action === "copied") {
            await addExportLog(jobId, "success", `Copied: ${destName}`, {
              fileId: file.id,
              fileName: destName,
              sourceName: file.sourceName,
              copiedFileId: result.id,
            });
          } else if (result.action === "shortcut") {
            await addExportLog(
              jobId,
              "info",
              `Created Drive Shortcut: ${destName} (form/protected by instructor)`,
              {
                fileId: file.id,
                fileName: destName,
                sourceName: file.sourceName,
                copiedFileId: result.id,
              }
            );
          } else {
            await addExportLog(
              jobId,
              "info",
              `Created Web Link Bookmark: ${destName}.html (direct web access)`,
              {
                fileId: file.id,
                fileName: destName,
                sourceName: file.sourceName,
                copiedFileId: result.id,
              }
            );
          }
        } catch (err: any) {
          failed++;
          await addExportLog(
            jobId,
            "error",
            `Failed to export "${file.name}": ${err.message || String(err)}`,
            { fileId: file.id, fileName: file.name, sourceName: file.sourceName }
          );
        }

        await notify({ copiedFiles: copied, skippedFiles: skipped, failedFiles: failed });
      }
    }

    await notify({
      status: "completed",
      copiedFiles: copied,
      skippedFiles: skipped,
      failedFiles: failed,
    });
    await addExportLog(
      jobId,
      "success",
      `Export complete! Copied: ${copied}, Skipped: ${skipped}, Failed: ${failed}.`
    );
  } catch (err: any) {
    await notify({ status: "failed" });
    await addExportLog(jobId, "error", `Export encountered an error: ${err.message || String(err)}`);
  }
}

/**
 * Runs client-side streaming ZIP download with O(1) memory.
 * Uses an AsyncGenerator to stream files one-by-one directly to disk
 * without buffering multiple file bodies in the browser heap.
 */
export async function runZipDownload(
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

  // Screen Wake Lock to keep mobile devices active during export
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
    await addExportLog(jobId, "info", `Preparing streaming ZIP download for "${courseName}"...`);

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
      `Discovered ${total} files. Initiating O(1) memory stream directly to local storage...`
    );

    let processed = 0;
    let failed = 0;

    // Pull-based async generator: fetches files strictly on-demand.
    // Each file stream is consumed and garbage-collected before fetching the next.
    async function* makeZipEntries(): AsyncGenerator<ZipFileInput, void, unknown> {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const folderPrefix = file.sourceName
          ? `${file.sourceName.replace(/[<>:"/\\|?*]/g, "_").trim()}/`
          : "";

        try {
          await addExportLog(
            jobId,
            "info",
            `Fetching (${i + 1}/${total}): ${file.name}...`
          );

          const fileData = await fetchFileForZip(accessToken, file.id, file.name);

          processed++;
          await notify({ copiedFiles: processed, failedFiles: failed });
          await addExportLog(jobId, "success", `Packaged: ${file.name}`, {
            fileId: file.id,
            fileName: file.name,
            sourceName: file.sourceName,
          });

          yield {
            name: `${folderPrefix}${fileData.name}`,
            input: fileData.input,
          };
          // Once client-zip consumes this input, the previous stream buffer is collected
        } catch (err: any) {
          failed++;
          await notify({ copiedFiles: processed, failedFiles: failed });
          await addExportLog(
            jobId,
            "warning",
            `Skipped unreadable file "${file.name}": ${err.message || String(err)}`,
            { fileId: file.id, fileName: file.name, sourceName: file.sourceName }
          );
        }
      }
    }

    await downloadFilesAsZip(makeZipEntries(), courseName);

    await notify({
      status: "completed",
      copiedFiles: processed,
      failedFiles: failed,
    });
    await addExportLog(
      jobId,
      "success",
      `Download complete! ${processed} files packaged into "${courseName}.zip".`
    );
  } catch (err: any) {
    if (err.message === "Save cancelled by user") {
      await notify({ status: "failed" });
      await addExportLog(jobId, "warning", "Export was cancelled by user.");
      return;
    }

    await notify({ status: "failed" });
    await addExportLog(jobId, "error", `ZIP download failed: ${err.message || String(err)}`);
    throw err;
  } finally {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
    }
  }
}
