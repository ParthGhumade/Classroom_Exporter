import archiver from "archiver";
import { Router } from "express";
import { db, exportJobs, exportLogs } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { decryptObject, encryptObject } from "../lib/crypto";
import { GetExportParams, GetExportLogsParams, CreateExportBody } from "@workspace/api-zod";
import { runExport, discoverCourseFiles, GOOGLE_WORKSPACE_EXPORTS, downloadDriveFile } from "../lib/exporter";
import { createOAuth2Client, getClassroomClient, getDriveClient } from "../lib/google";
import type { Request, Response } from "express";

function inferMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    doc: "application/msword",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    txt: "text/plain",
    csv: "text/csv",
  };
  return map[ext] ?? "application/octet-stream";
}

const router = Router();

router.get("/exports", async (req: Request, res: Response) => {
  const rawTokens = req.session.tokens;
  if (!rawTokens) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const jobs = await db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.userEmail, req.session.userEmail || ""))
      .orderBy(desc(exportJobs.createdAt))
      .limit(50);

    res.json(
      jobs.map((j) => ({
        ...j,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      }))
    );
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to list exports");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/exports", async (req: Request, res: Response) => {
  const rawTokens = req.session.tokens;
  if (!rawTokens) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const tokens = typeof rawTokens === "string" ? decryptObject(rawTokens) : rawTokens;
  if (!tokens) {
    res.status(401).json({ error: "Invalid session tokens" });
    return;
  }

  const parsed = CreateExportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { courseId, courseName } = parsed.data;

  try {
    const [job] = await db
      .insert(exportJobs)
      .values({ courseId, courseName, userEmail: req.session.userEmail || "", status: "pending" })
      .returning();

    const tokenSnapshot = { ...tokens };
    setImmediate(() => {
      runExport(job.id, tokenSnapshot).catch((err) => {
        req.log.error({ err }, "Background export failed");
      });
    });

    res.status(201).json({
      ...job,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create export");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/exports/download", async (req: Request, res: Response) => {
  const rawTokens = req.session.tokens;
  if (!rawTokens) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const tokens = typeof rawTokens === "string" ? decryptObject(rawTokens) : rawTokens;
  if (!tokens) {
    res.status(401).json({ error: "Invalid session tokens" });
    return;
  }

  const parsed = CreateExportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { courseId, courseName } = parsed.data;

  try {
    const onTokens = (newTokens: any) => {
      req.session.tokens = encryptObject({ ...tokens, ...newTokens }) as any;
      req.session.save();
    };
    
    const oauth2Client = createOAuth2Client(tokens, onTokens);
    const classroom = getClassroomClient(tokens, onTokens);
    const drive = getDriveClient(tokens, onTokens);

    const tokenResponse = await oauth2Client.getAccessToken();
    const accessToken = tokenResponse.token;
    if (!accessToken) {
      res.status(401).json({ error: "Could not obtain access token" });
      return;
    }

    const files = await discoverCourseFiles(classroom, courseId);

    const safeFilename = courseName.replace(/[<>:"/\\|?*]/g, "_").trim() || "export";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.zip"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err: Error) => req.log.error({ err }, "Archiver error"));
    archive.pipe(res);

    for (const file of files) {
      try {
        let mimeType = inferMime(file.name);
        try {
          const meta = await drive.files.get({ fileId: file.id, fields: "mimeType", supportsAllDrives: true });
          mimeType = meta.data.mimeType ?? mimeType;
        } catch { /* use extension fallback */ }

        const workspaceExport = GOOGLE_WORKSPACE_EXPORTS[mimeType];
        let entryName: string;
        let buffer: Buffer;

        if (workspaceExport) {
          const baseName = file.name.replace(/\.[^.]+$/, "");
          entryName = `${baseName}${workspaceExport.ext}`;
          const exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(workspaceExport.mime)}`;
          const exportRes = await fetch(exportUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!exportRes.ok) {
            req.log.warn({ fileId: file.id, status: exportRes.status }, `Skipping workspace file: ${file.name}`);
            continue;
          }
          buffer = Buffer.from(await exportRes.arrayBuffer());
        } else {
          entryName = file.name;
          buffer = await downloadDriveFile(drive, file.id, accessToken);
        }

        archive.append(buffer, { name: entryName });
      } catch (err) {
        req.log.warn({ err, fileId: file.id }, `Failed to add ${file.name} to ZIP`);
      }
    }

    await archive.finalize();
  } catch (err: unknown) {
    req.log.error({ err }, "ZIP download failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/exports/:id", async (req: Request, res: Response) => {
  const rawTokens = req.session.tokens;
  if (!rawTokens) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = GetExportParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid export id" });
    return;
  }

  try {
    const [job] = await db
      .select()
      .from(exportJobs)
      .where(
        and(
          eq(exportJobs.id, parsed.data.id),
          eq(exportJobs.userEmail, req.session.userEmail || "")
        )
      )
      .limit(1);

    if (!job) {
      res.status(404).json({ error: "Export not found" });
      return;
    }

    const logs = await db
      .select()
      .from(exportLogs)
      .where(eq(exportLogs.exportId, job.id))
      .orderBy(exportLogs.createdAt);

    res.json({
      ...job,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      logs: logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to get export");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/exports/:id/logs", async (req: Request, res: Response) => {
  const rawTokens = req.session.tokens;
  if (!rawTokens) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = GetExportLogsParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid export id" });
    return;
  }

  try {
    const logs = await db
      .select()
      .from(exportLogs)
      .where(eq(exportLogs.exportId, parsed.data.id))
      .orderBy(exportLogs.createdAt)
      .limit(500);

    if (logs.length === 0) {
      const [check] = await db
        .select()
        .from(exportJobs)
        .where(
          and(
            eq(exportJobs.id, parsed.data.id),
            eq(exportJobs.userEmail, req.session.userEmail || "")
          )
        )
        .limit(1);
      if (!check) {
        res.status(404).json({ error: "Export not found" });
        return;
      }
    }

    res.json(
      logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      }))
    );
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to get export logs");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
