import { db, exportJobs, exportLogs } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getClassroomClient, getDriveClient } from "./google";
import { logger } from "./logger";

type Tokens = Record<string, unknown>;
type DriveClient = ReturnType<typeof getDriveClient>;

// ── Google Workspace MIME type → export MIME + file extension ────────────────
const GOOGLE_WORKSPACE_EXPORTS: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: ".xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: ".pptx",
  },
  "application/vnd.google-apps.drawing": {
    mime: "image/png",
    ext: ".png",
  },
};

// ── DB helpers ───────────────────────────────────────────────────────────────

async function addLog(
  exportId: number,
  level: "info" | "success" | "warning" | "error",
  message: string,
  extra?: {
    fileId?: string;
    fileName?: string;
    sourceName?: string;
    copiedFileId?: string;
  }
) {
  await db.insert(exportLogs).values({
    exportId,
    level,
    message,
    fileId: extra?.fileId ?? null,
    fileName: extra?.fileName ?? null,
    sourceName: extra?.sourceName ?? null,
    copiedFileId: extra?.copiedFileId ?? null,
  });
}

async function updateJob(
  id: number,
  fields: Partial<typeof exportJobs.$inferInsert>
) {
  await db
    .update(exportJobs)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(exportJobs.id, id));
}

// ── Classroom file collection ────────────────────────────────────────────────

interface DriveFileRef {
  id: string;
  name: string;
  sourceName: string;
}

function extractDriveFiles(
  materials: Array<{
    driveFile?: { driveFile?: { id?: string | null; title?: string | null } | null } | null;
  }>,
  sourceName: string,
  files: DriveFileRef[]
) {
  for (const mat of materials) {
    const df = mat.driveFile?.driveFile;
    if (df?.id && df.title) {
      files.push({ id: df.id, name: df.title, sourceName });
    }
  }
}

async function collectDriveFiles(
  classroom: ReturnType<typeof getClassroomClient>,
  courseId: string,
  exportId: number
): Promise<DriveFileRef[]> {
  const files: DriveFileRef[] = [];

  await addLog(exportId, "info", "Fetching course coursework...");
  try {
    let pageToken: string | undefined;
    do {
      const res = await classroom.courses.courseWork.list({ courseId, pageToken });
      for (const item of res.data.courseWork ?? []) {
        extractDriveFiles(
          item.materials ?? [],
          item.title ?? "Untitled Coursework",
          files
        );
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    await addLog(exportId, "info", `Found coursework. Total drive files so far: ${files.length}`);
  } catch (err: unknown) {
    await addLog(exportId, "warning", `Could not fetch coursework: ${(err as Error).message}`);
  }

  await addLog(exportId, "info", "Fetching course materials...");
  try {
    let pageToken: string | undefined;
    do {
      const res = await classroom.courses.courseWorkMaterials.list({ courseId, pageToken });
      for (const item of res.data.courseWorkMaterial ?? []) {
        extractDriveFiles(
          item.materials ?? [],
          item.title ?? "Untitled Material",
          files
        );
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    await addLog(exportId, "info", `Fetched materials. Total drive files so far: ${files.length}`);
  } catch (err: unknown) {
    await addLog(exportId, "warning", `Could not fetch course materials: ${(err as Error).message}`);
  }

  await addLog(exportId, "info", "Fetching announcements...");
  try {
    let pageToken: string | undefined;
    do {
      const res = await classroom.courses.announcements.list({ courseId, pageToken });
      for (const item of res.data.announcements ?? []) {
        extractDriveFiles(
          item.materials ?? [],
          item.text?.slice(0, 60) ?? "Announcement",
          files
        );
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    await addLog(exportId, "info", `Fetched announcements. Total drive files: ${files.length}`);
  } catch (err: unknown) {
    await addLog(exportId, "warning", `Could not fetch announcements: ${(err as Error).message}`);
  }

  const seen = new Set<string>();
  return files.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

// ── Drive helpers ────────────────────────────────────────────────────────────

async function listExistingFiles(
  drive: DriveClient,
  folderId: string
): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (f.name && f.id) nameToId.set(f.name, f.id);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return nameToId;
}

function isPermissionError(err: unknown): boolean {
  const msg = (err as Error).message ?? String(err);
  return (
    msg.includes("File not found") ||
    msg.includes("404") ||
    msg.includes("403") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("permission")
  );
}

/**
 * Download a Drive file as a Node.js readable stream plus the upload MIME type
 * and final filename. Handles both Google Workspace files (via files.export)
 * and binary files (via files.get + alt=media).
 */
async function downloadFile(
  drive: DriveClient,
  fileId: string,
  originalName: string
): Promise<{ stream: NodeJS.ReadableStream; uploadMime: string; uploadName: string }> {
  // First get metadata so we know the MIME type
  const metaRes = await drive.files.get({
    fileId,
    fields: "id,name,mimeType",
    supportsAllDrives: true,
  });

  const mimeType = metaRes.data.mimeType ?? "application/octet-stream";
  const workspaceExport = GOOGLE_WORKSPACE_EXPORTS[mimeType];

  if (workspaceExport) {
    // Google Workspace file — export to Office format
    const res = await drive.files.export(
      { fileId, mimeType: workspaceExport.mime },
      { responseType: "stream" }
    );
    const baseName = originalName.replace(/\.[^.]+$/, ""); // strip any existing ext
    return {
      stream: res.data as unknown as NodeJS.ReadableStream,
      uploadMime: workspaceExport.mime,
      uploadName: baseName + workspaceExport.ext,
    };
  }

  // Binary / non-Workspace file — download raw bytes
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );
  return {
    stream: res.data as unknown as NodeJS.ReadableStream,
    uploadMime: mimeType,
    uploadName: originalName,
  };
}

/**
 * Upload a readable stream into a Drive folder and return the new file ID.
 */
async function uploadToFolder(
  drive: DriveClient,
  stream: NodeJS.ReadableStream,
  name: string,
  mimeType: string,
  folderId: string
): Promise<string> {
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: "id, name",
    supportsAllDrives: true,
  });
  return res.data.id ?? "";
}

// ── Main export runner ───────────────────────────────────────────────────────

export async function runExport(exportId: number, tokens: Tokens) {
  try {
    await updateJob(exportId, { status: "running" });
    await addLog(exportId, "info", "Export started.");

    const classroom = getClassroomClient(tokens);
    const drive = getDriveClient(tokens);

    const [job] = await db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, exportId))
      .limit(1);

    if (!job) throw new Error("Export job not found");

    const files = await collectDriveFiles(classroom, job.courseId, exportId);
    const total = files.length;

    await updateJob(exportId, {
      totalFiles: total,
      copiedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
    });
    await addLog(
      exportId,
      "info",
      `Total unique Drive files found: ${total}. Checking target folder for duplicates...`
    );

    const existing = await listExistingFiles(drive, job.targetFolderId);
    await addLog(exportId, "info", `Target folder has ${existing.size} existing file(s).`);

    let copied = 0;
    let skipped = 0;
    let failed = 0;

    for (const file of files) {
      if (existing.has(file.name)) {
        skipped++;
        await addLog(exportId, "warning", `Skipped (already exists): ${file.name}`, {
          fileId: file.id,
          fileName: file.name,
          sourceName: file.sourceName,
        });
        await updateJob(exportId, { copiedFiles: copied, skippedFiles: skipped, failedFiles: failed });
        continue;
      }

      // ── Strategy 1: direct copy ───────────────────────────────────────────
      let newFileId: string | null = null;
      let method = "copy";

      try {
        const copyRes = await drive.files.copy({
          fileId: file.id,
          supportsAllDrives: true,
          requestBody: { name: file.name, parents: [job.targetFolderId] },
          fields: "id, name",
        });
        newFileId = copyRes.data.id ?? null;
      } catch (copyErr: unknown) {
        if (!isPermissionError(copyErr)) {
          // Unexpected error — log and move on
          failed++;
          await addLog(
            exportId,
            "error",
            `Failed to copy "${file.name}": ${(copyErr as Error).message}`,
            { fileId: file.id, fileName: file.name, sourceName: file.sourceName }
          );
          await updateJob(exportId, { copiedFiles: copied, skippedFiles: skipped, failedFiles: failed });
          continue;
        }

        // ── Strategy 2: download → re-upload ─────────────────────────────
        method = "download+upload";
        try {
          const { stream, uploadMime, uploadName } = await downloadFile(
            drive,
            file.id,
            file.name
          );
          newFileId = await uploadToFolder(
            drive,
            stream,
            uploadName,
            uploadMime,
            job.targetFolderId
          );
          // If the exported name differs (e.g. .docx appended), track both
          existing.set(uploadName, newFileId);
        } catch (dlErr: unknown) {
          failed++;
          const dlMsg = (dlErr as Error).message ?? String(dlErr);
          const hint = dlMsg.includes("File not found") || dlMsg.includes("404")
            ? "No read access — file is not shared with this Google account."
            : dlMsg;
          await addLog(
            exportId,
            "error",
            `Failed to transfer "${file.name}": ${hint}`,
            { fileId: file.id, fileName: file.name, sourceName: file.sourceName }
          );
          await updateJob(exportId, { copiedFiles: copied, skippedFiles: skipped, failedFiles: failed });
          continue;
        }
      }

      if (newFileId) {
        copied++;
        existing.set(file.name, newFileId);
        await addLog(
          exportId,
          "success",
          `${method === "download+upload" ? "Downloaded & uploaded" : "Copied"}: ${file.name}`,
          {
            fileId: file.id,
            fileName: file.name,
            sourceName: file.sourceName,
            copiedFileId: newFileId,
          }
        );
      }

      await updateJob(exportId, { copiedFiles: copied, skippedFiles: skipped, failedFiles: failed });
    }

    await updateJob(exportId, {
      status: "completed",
      copiedFiles: copied,
      skippedFiles: skipped,
      failedFiles: failed,
    });
    await addLog(
      exportId,
      "success",
      `Export complete. Copied: ${copied}, Skipped: ${skipped}, Failed: ${failed}.`
    );
  } catch (err: unknown) {
    logger.error({ err }, "Export job failed");
    await updateJob(exportId, { status: "failed" });
    await addLog(exportId, "error", `Export failed: ${(err as Error).message}`);
  }
}
