export const GOOGLE_WORKSPACE_EXPORTS: Record<string, { mime: string; ext: string }> = {
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

/**
 * Exponential backoff helper for Google API rate limits (429/500/503)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delayMs = 1000
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt - 1)));
          continue;
        }
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt - 1)));
        continue;
      }
      throw err;
    }
  }
  return fetch(url, options);
}

/**
 * Create a folder in Google Drive
 */
export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string> {
  const body: Record<string, any> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    body.parents = [parentId];
  }

  const res = await fetchWithRetry("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create folder ${name} (HTTP ${res.status})`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * List files already in a Drive folder to avoid duplicate uploads
 */
export async function listFolderFiles(
  accessToken: string,
  folderId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const data = await res.json();
      for (const f of data.files ?? []) {
        if (f.name && f.id) map.set(f.name, f.id);
      }
      pageToken = data.nextPageToken;
    } else {
      break;
    }
  } while (pageToken);

  return map;
}

/**
 * Copy an existing Drive file directly inside Google Drive (Google-to-Google transfer)
 */
export async function copyDriveFile(
  accessToken: string,
  fileId: string,
  name: string,
  targetFolderId: string
): Promise<string> {
  const res = await fetchWithRetry(
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        parents: [targetFolderId],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to copy ${name} (HTTP ${res.status})`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Create a shortcut in Google Drive pointing to an existing file
 */
export async function createDriveShortcut(
  accessToken: string,
  targetId: string,
  name: string,
  targetFolderId: string
): Promise<string> {
  const res = await fetchWithRetry("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.shortcut",
      parents: [targetFolderId],
      shortcutDetails: {
        targetId,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create shortcut for ${name} (HTTP ${res.status})`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Create an HTML redirect bookmark file in Google Drive
 */
export async function createDriveHtmlBookmark(
  accessToken: string,
  name: string,
  url: string,
  targetFolderId: string
): Promise<string> {
  const cleanName = name.toLowerCase().endsWith(".html") ? name : `${name}.html`;
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${url}">
  <title>${name}</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 3rem;">
  <h2>${name}</h2>
  <p style="color: #666;">This item is a Google Form, assignment submission, or restricted resource.</p>
  <p><a href="${url}" target="_blank" style="display:inline-block; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Open Resource &rarr;</a></p>
</body>
</html>`;

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: cleanName,
    mimeType: "text/html",
    parents: [targetFolderId],
  };

  const body =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: text/html; charset=UTF-8\r\n\r\n" +
    htmlContent +
    closeDelimiter;

  const res = await fetchWithRetry(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create link bookmark (HTTP ${res.status})`);
  }

  const data = await res.json();
  return data.id;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  canCopy?: boolean;
  canDownload?: boolean;
  webViewLink?: string;
}

export async function getDriveFileMetadata(
  accessToken: string,
  fileId: string
): Promise<DriveFileMetadata | null> {
  try {
    const res = await fetchWithRetry(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,capabilities(canCopy,canDownload),webViewLink&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType || "",
      canCopy: data.capabilities?.canCopy ?? true,
      canDownload: data.capabilities?.canDownload ?? true,
      webViewLink: data.webViewLink || `https://drive.google.com/open?id=${fileId}`,
    };
  } catch {
    return null;
  }
}

export type ExportActionResult = "copied" | "shortcut" | "bookmark";

/**
 * Copies a Drive file if permitted.
 * If the file is copy-restricted by the instructor (or is a Google Form / Folder),
 * automatically creates a Drive Shortcut or HTML Link so the export never fails.
 */
export async function copyOrShortcutDriveFile(
  accessToken: string,
  fileId: string,
  name: string,
  targetFolderId: string
): Promise<{ id: string; action: ExportActionResult }> {
  // Check metadata first
  const meta = await getDriveFileMetadata(accessToken, fileId);

  const isForm = meta?.mimeType === "application/vnd.google-apps.form";
  const cannotCopy = meta && meta.canCopy === false;
  const webLink = meta?.webViewLink || `https://drive.google.com/open?id=${fileId}`;

  // If regular file and copying is allowed, try direct copy
  if (!isForm && !cannotCopy) {
    try {
      const copiedId = await copyDriveFile(accessToken, fileId, name, targetFolderId);
      return { id: copiedId, action: "copied" };
    } catch (err: any) {
      const msg = err.message || "";
      const isCopyBlocked =
        msg.includes("cannot be copied") ||
        msg.includes("cannotCopy") ||
        msg.includes("copyNotAllowed") ||
        msg.includes("403");

      if (!isCopyBlocked) {
        throw err;
      }
      // Fall through to shortcut/bookmark
    }
  }

  // Attempt 1: Create a native Google Drive shortcut
  try {
    const shortcutId = await createDriveShortcut(accessToken, fileId, name, targetFolderId);
    return { id: shortcutId, action: "shortcut" };
  } catch (shortcutErr) {
    // Attempt 2: If Drive shortcut is prohibited across domains, create an HTML bookmark file
    const bookmarkId = await createDriveHtmlBookmark(accessToken, name, webLink, targetFolderId);
    return { id: bookmarkId, action: "bookmark" };
  }
}

/**
 * Download a file's content directly from Google Drive for streaming into ZIP.
 * Automatically converts Google Docs, Sheets, Slides to standard Office files (.docx, .xlsx, .pptx).
 * For forms or copy-restricted files, produces an HTML redirect bookmark so files are never lost.
 */
export async function fetchFileForZip(
  accessToken: string,
  fileId: string,
  originalName: string
): Promise<{ name: string; input: Response | Blob }> {
  // Check file metadata for MIME type and capabilities
  const meta = await getDriveFileMetadata(accessToken, fileId);
  const mimeType = meta?.mimeType || "";
  const webLink = meta?.webViewLink || `https://drive.google.com/open?id=${fileId}`;

  // If Google Form or non-downloadable file, generate an HTML bookmark
  if (mimeType === "application/vnd.google-apps.form" || (meta && meta.canDownload === false)) {
    const baseName = originalName.replace(/\.[^.]+$/, "");
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${webLink}">
  <title>${originalName}</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 3rem;">
  <h2>${originalName}</h2>
  <p style="color: #666;">This item is an interactive Google Form or copy-restricted resource.</p>
  <p><a href="${webLink}" target="_blank" style="display:inline-block; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Open in Google Drive &rarr;</a></p>
</body>
</html>`;
    return {
      name: `${baseName}.html`,
      input: new Blob([htmlContent], { type: "text/html" }),
    };
  }

  const workspaceExport = GOOGLE_WORKSPACE_EXPORTS[mimeType];

  if (workspaceExport) {
    // Export Google Workspace document to OpenXML format via streaming proxy
    const baseName = originalName.replace(/\.[^.]+$/, "");
    const exportName = `${baseName}${workspaceExport.ext}`;
    const exportProxyUrl = `/api/proxy?fileId=${encodeURIComponent(
      fileId
    )}&exportMime=${encodeURIComponent(workspaceExport.mime)}`;

    try {
      const res = await fetchWithRetry(exportProxyUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        return { name: exportName, input: res };
      }
    } catch {
      // Proxy unavailable or failed, fall through to HTML bookmark
    }

    // Fallback if export restricted
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${webLink}">
  <title>${originalName}</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 3rem;">
  <h2>${originalName}</h2>
  <p style="color: #666;">This Google Workspace document could not be converted automatically.</p>
  <p><a href="${webLink}" target="_blank" style="display:inline-block; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Open in Google Drive &rarr;</a></p>
</body>
</html>`;
    return {
      name: `${baseName}.html`,
      input: new Blob([htmlContent], { type: "text/html" }),
    };
  }

  // Binary file download via /api/proxy (bypasses browser CORS on Google CDN redirects)
  const downloadProxyUrl = `/api/proxy?fileId=${encodeURIComponent(fileId)}`;
  try {
    const res = await fetchWithRetry(downloadProxyUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      return { name: originalName, input: res };
    }
  } catch {
    // Network or proxy error, fall through to HTML bookmark
  }

  // Fallback to HTML bookmark if file has restricted download permissions
  const baseName = originalName.replace(/\.[^.]+$/, "");
  const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${webLink}">
  <title>${originalName}</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 3rem;">
  <h2>${originalName}</h2>
  <p style="color: #666;">This file is copy-restricted or requires specific permissions in Google Drive.</p>
  <p><a href="${webLink}" target="_blank" style="display:inline-block; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Open in Google Drive &rarr;</a></p>
</body>
</html>`;
  return {
    name: `${baseName}.html`,
    input: new Blob([fallbackHtml], { type: "text/html" }),
  };
}
