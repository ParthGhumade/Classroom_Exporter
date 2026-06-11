import { Router } from "express";
import { getClassroomClient } from "../lib/google";
import { decryptObject } from "../lib/crypto";
import type { Request, Response } from "express";

const router = Router();

router.get("/courses", async (req: Request, res: Response) => {
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

  try {
    const classroom = getClassroomClient(tokens);
    const courses: unknown[] = [];
    let pageToken: string | undefined;

    do {
      const response = await classroom.courses.list({
        courseStates: ["ACTIVE", "ARCHIVED", "PROVISIONED", "DECLINED"],
        pageToken,
        pageSize: 100,
      });
      const items = response.data.courses ?? [];
      for (const course of items) {
        courses.push({
          id: course.id ?? "",
          name: course.name ?? "",
          section: course.section ?? null,
          descriptionHeading: course.descriptionHeading ?? null,
          courseState: course.courseState ?? "ACTIVE",
          enrollmentCode: course.enrollmentCode ?? null,
          teacherFolder: course.teacherFolder?.id ?? null,
          creationTime: course.creationTime ?? null,
          updateTime: course.updateTime ?? null,
        });
      }
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    res.json(courses);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to list courses");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
