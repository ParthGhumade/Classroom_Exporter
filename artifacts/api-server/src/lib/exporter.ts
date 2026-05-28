import { db, exportJobs, exportLogs } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getClassroomClient, getDriveClient } from "./google";
import { logger } from "./logger";

type Tokens = Record<string, unknown>;

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

interface DriveFileRef {
  id: string;
  name: string;
  sourceName: string;
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
      const res = await classroom.courses.courseWork.list({
        courseId,
        pageToken,
      });
      const items = res.data.courseWork ?? [];
      for (const item of items) {
        const materials = item.materials ?? [];
        for (const mat of materials) {
          if (mat.driveFile?.driveFile?.id && mat.driveFile.driveFile.title) {
            files.push({
              id: mat.driveFile.driveFile.id,
              name: mat.driveFile.driveFile.title,
              sourceName: item.title ?? "Untitled Coursework",
            });
          }
        }
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
      const res = await classroom.courses.courseWorkMaterials.list({
        courseId,
        pageToken,
      });
      const items = res.data.courseWorkMaterial ?? [];
      for (const item of items) {
        const materials = item.materials ?? [];
        for (const mat of materials) {
          if (mat.driveFile?.driveFile?.id && mat.driveFile.driveFile.title) {
            files.push({
              id: mat.driveFile.driveFile.id,
              name: mat.driveFile.driveFile.title,
              sourceName: item.title ?? "Untitled Material",
            });
          }
        }
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
      const res = await classroom.courses.announcements.list({
        courseId,
        pageToken,
      });
      const items = res.data.announcements ?? [];
      for (const item of items) {
        const materials = item.materials ?? [];
        for (const mat of materials) {
          if (mat.driveFile?.driveFile?.id && mat.driveFile.driveFile.title) {
            files.push({
              id: mat.driveFile.driveFile.id,
              name: mat.driveFile.driveFile.title,
              sourceName: item.text?.slice(0, 60) ?? "Announcement",
            });
          }
        }
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

async function listExistingFiles(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string
): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      if (f.name && f.id) nameToId.set(f.name, f.id);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return nameToId;
}

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
    await addLog(exportId, "info", `Total unique Drive files found: ${total}. Checking target folder for duplicates...`);

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

      try {
        const copyRes = await drive.files.copy({
          fileId: file.id,
          requestBody: {
            name: file.name,
            parents: [job.targetFolderId],
          },
          fields: "id, name",
        });
        copied++;
        existing.set(file.name, copyRes.data.id ?? "");
        await addLog(exportId, "success", `Copied: ${file.name}`, {
          fileId: file.id,
          fileName: file.name,
          sourceName: file.sourceName,
          copiedFileId: copyRes.data.id ?? undefined,
        });
      } catch (err: unknown) {
        failed++;
        await addLog(exportId, "error", `Failed to copy "${file.name}": ${(err as Error).message}`, {
          fileId: file.id,
          fileName: file.name,
          sourceName: file.sourceName,
        });
      }

      await updateJob(exportId, { copiedFiles: copied, skippedFiles: skipped, failedFiles: failed });
    }

    await updateJob(exportId, {
      status: "completed",
      copiedFiles: copied,
      skippedFiles: skipped,
      failedFiles: failed,
    });
    await addLog(exportId, "success", `Export complete. Copied: ${copied}, Skipped: ${skipped}, Failed: ${failed}.`);
  } catch (err: unknown) {
    logger.error({ err }, "Export job failed");
    await updateJob(exportId, { status: "failed" });
    await addLog(exportId, "error", `Export failed: ${(err as Error).message}`);
  }
}
