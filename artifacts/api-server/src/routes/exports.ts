import { Router } from "express";
import { db, exportJobs, exportLogs } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { GetExportParams, GetExportLogsParams, CreateExportBody } from "@workspace/api-zod";
import { runExport } from "../lib/exporter";
import type { Request, Response } from "express";

const router = Router();

router.get("/exports", async (req: Request, res: Response) => {
  try {
    const jobs = await db
      .select()
      .from(exportJobs)
      .orderBy(desc(exportJobs.createdAt));

    res.json(
      jobs.map((j) => ({
        ...j,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      }))
    );
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to list exports");
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/exports", async (req: Request, res: Response) => {
  const tokens = req.session.tokens;
  if (!tokens) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = CreateExportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { courseId, courseName, targetFolderId } = parsed.data;

  try {
    const [job] = await db
      .insert(exportJobs)
      .values({ courseId, courseName, targetFolderId, status: "pending" })
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
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/exports/:id", async (req: Request, res: Response) => {
  const parsed = GetExportParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid export id" });
    return;
  }

  try {
    const [job] = await db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, parsed.data.id))
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
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/exports/:id/logs", async (req: Request, res: Response) => {
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
      .orderBy(exportLogs.createdAt);

    if (logs.length === 0) {
      const [check] = await db
        .select()
        .from(exportJobs)
        .where(eq(exportJobs.id, parsed.data.id))
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
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
