import { Readable } from "stream";
import { db, exportJobs, exportLogs } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createOAuth2Client, getClassroomClient, getDriveClient } from "./google";
import { logger } from "./logger";

type Tokens = Record<string, unknown>;
type DriveClient = ReturnType<typeof getDriveClient>;
type OAuth2Client = ReturnType<typeof createOAuth2Client>;

// ── Google Workspace MIME → export MIME + extension ──────────────────────────
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

// Extension-based MIME fallback when Drive metadata is inaccessible
function inferMimeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    doc: "application/msword",
    xls: "application/vnd.ms-excel",
    ppt: "application/vnd.ms-powerpoint",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    txt: "text/plain",
    csv: "text/csv",
    zip: "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}

function bufferToStream(buf: Buffer): NodeJS.ReadableStream {
  const readable = new Readable();
  readable.push(buf);
  readable.push(null);
  return readable;
}

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
    driveFile?: {
      driveFile?: { id?: string | null; title?: string | null } | null;
    } | null;
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
        extractDriveFiles(item.materials ?? [], item.title ?? "Untitled Coursework", files);
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
        extractDriveFiles(item.materials ?? [], item.title ?? "Untitled Material", files);
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
 * Raw authenticated fetch helper — bypasses Drive API ACL checks.
 * Works for files the user's Classroom session can see but Drive API blocks.
 */
async function rawFetch(url: string, accessToken: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Download a Drive file, returning a readable stream + upload metadata.
 *
 * Strategy per file type:
 *   Google Workspace → drive.files.export()  →  raw fetch export URL (fallback)
 *   Binary / other   → raw fetch  uc?export=download  (bypasses Drive ACL)
 *
 * If drive.files.get for metadata fails (also blocked), MIME is inferred
 * from the filename extension so we can still attempt the download.
 */
async function downloadFile(
  drive: DriveClient,
  oauth2Client: OAuth2Client,
  fileId: string,
  originalName: string
): Promise<{ stream: NodeJS.ReadableStream; uploadMime: string; uploadName: string }> {
  // Obtain a valid access token for raw HTTP requests
  const tokenResponse = await oauth2Client.getAccessToken();
  const accessToken = tokenResponse.token;
  if (!accessToken) throw new Error("No access token available");

  // Try to get MIME type from Drive metadata; fall back to extension inference
  let mimeType: string;
  try {
    const metaRes = await drive.files.get({
      fileId,
      fields: "id,name,mimeType",
      supportsAllDrives: true,
    });
    mimeType = metaRes.data.mimeType ?? inferMimeFromExtension(originalName);
  } catch {
    mimeType = inferMimeFromExtension(originalName);
  }

  const workspaceExport = GOOGLE_WORKSPACE_EXPORTS[mimeType];

  if (workspaceExport) {
    const baseName = originalName.replace(/\.[^.]+$/, "");
    const uploadName = baseName + workspaceExport.ext;

    // Attempt 1: Drive API export (fast, streaming)
    try {
      const res = await drive.files.export(
        { fileId, mimeType: workspaceExport.mime },
        { responseType: "stream" }
      );
      return {
        stream: res.data as unknown as NodeJS.ReadableStream,
        uploadMime: workspaceExport.mime,
        uploadName,
      };
    } catch {
      // Attempt 2: raw authenticated fetch to the Drive export endpoint
      const exportUrl =
        `https://www.googleapis.com/drive/v3/files/${fileId}/export` +
        `?mimeType=${encodeURIComponent(workspaceExport.mime)}`;
      const buffer = await rawFetch(exportUrl, accessToken);
      return {
        stream: bufferToStream(buffer),
        uploadMime: workspaceExport.mime,
        uploadName,
      };
    }
  }

  // Binary / non-Workspace file: raw authenticated fetch
  // The uc?export=download endpoint honours Classroom-granted access
  // that the Drive API files.get(alt=media) endpoint does not.
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const buffer = await rawFetch(downloadUrl, accessToken);
  return {
    stream: bufferToStream(buffer),
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

    const oauth2Client = createOAuth2Client(tokens);
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

      // ── Strategy 1: server-side Drive copy ───────────────────────────────
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

        // ── Strategy 2: download (raw fetch) → re-upload ─────────────────
        method = "download+upload";
        try {
          const { stream, uploadMime, uploadName } = await downloadFile(
            drive,
            oauth2Client,
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
          existing.set(uploadName, newFileId);
        } catch (dlErr: unknown) {
          failed++;
          const dlMsg = (dlErr as Error).message ?? String(dlErr);
          const hint =
            dlMsg.includes("404") || dlMsg.includes("403")
              ? `No access to this file even via direct download (${dlMsg}).`
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
