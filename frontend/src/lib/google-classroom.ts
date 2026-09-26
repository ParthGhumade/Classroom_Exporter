export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string | null;
  descriptionHeading?: string | null;
  courseState: string;
  enrollmentCode?: string | null;
  teacherFolder?: string | null;
  creationTime?: string | null;
  updateTime?: string | null;
}

export interface DriveFileRef {
  id: string;
  name: string;
  sourceName: string;
}

/**
 * List all courses the user is enrolled in or teaches.
 */
export async function listCourses(accessToken: string): Promise<ClassroomCourse[]> {
  const courses: ClassroomCourse[] = [];
  let pageToken: string | undefined;

  const states = ["ACTIVE", "ARCHIVED", "PROVISIONED", "DECLINED"];
  const queryParams = new URLSearchParams({ pageSize: "100" });
  for (const s of states) {
    queryParams.append("courseStates", s);
  }

  do {
    if (pageToken) {
      queryParams.set("pageToken", pageToken);
    }
    const url = `https://classroom.googleapis.com/v1/courses?${queryParams.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to fetch courses (HTTP ${res.status})`);
    }

    const data = await res.json();
    for (const c of data.courses ?? []) {
      courses.push({
        id: c.id,
        name: c.name,
        section: c.section ?? null,
        descriptionHeading: c.descriptionHeading ?? null,
        courseState: c.courseState ?? "ACTIVE",
        enrollmentCode: c.enrollmentCode ?? null,
        teacherFolder: c.teacherFolder?.id ?? null,
        creationTime: c.creationTime ?? null,
        updateTime: c.updateTime ?? null,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return courses;
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

/**
 * Discovers all Drive files attached to coursework, materials, and announcements in a course.
 */
export async function discoverCourseFiles(
  accessToken: string,
  courseId: string
): Promise<DriveFileRef[]> {
  const files: DriveFileRef[] = [];

  // 1. Fetch CourseWork
  try {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(
        `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const item of data.courseWork ?? []) {
          extractDriveFiles(item.materials ?? [], item.title ?? "Coursework", files);
        }
        pageToken = data.nextPageToken;
      } else {
        break;
      }
    } while (pageToken);
  } catch {
    // Skip if permissions restrict
  }

  // 2. Fetch CourseWorkMaterials
  try {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(
        `https://classroom.googleapis.com/v1/courses/${courseId}/courseWorkMaterials?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const item of data.courseWorkMaterial ?? []) {
          extractDriveFiles(item.materials ?? [], item.title ?? "Material", files);
        }
        pageToken = data.nextPageToken;
      } else {
        break;
      }
    } while (pageToken);
  } catch {
    // Skip
  }

  // 3. Fetch Announcements
  try {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(
        `https://classroom.googleapis.com/v1/courses/${courseId}/announcements?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const item of data.announcements ?? []) {
          extractDriveFiles(
            item.materials ?? [],
            item.text ? item.text.slice(0, 60).trim() : "Announcement",
            files
          );
        }
        pageToken = data.nextPageToken;
      } else {
        break;
      }
    } while (pageToken);
  } catch {
    // Skip
  }

  // Deduplicate files by id while keeping track of topic
  const seen = new Set<string>();
  return files.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}
