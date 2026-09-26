import { downloadZip } from "client-zip";

export interface ZipFileInput {
  name: string;
  input: Response | Blob | string;
}

/**
 * Checks if the browser supports the File System Access API for true O(1) disk streaming.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

/**
 * Packages an async iterable or array of files into a streaming ZIP archive.
 * When supported (Chromium/Edge), streams chunks directly to disk with O(1) RAM.
 * Falls back to Blob URL download on browsers without File System Access (iOS/Safari/Firefox).
 */
export async function downloadFilesAsZip(
  files: ZipFileInput[] | AsyncIterable<ZipFileInput>,
  archiveFilename: string
): Promise<void> {
  const safeFilename =
    archiveFilename
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "export";

  // Initialize client-zip streaming response
  const zipResponse = downloadZip(files);

  if (!zipResponse.body) {
    throw new Error("ZIP response stream is unavailable");
  }

  // TIER 1: Native direct-to-disk streaming (Chromium, Edge, Desktop Chrome, Opera, Brave)
  // Memory consumption is O(1) constant (<15 MB RAM) regardless of archive size (even 10GB+).
  if (isFileSystemAccessSupported()) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: `${safeFilename}.zip`,
        types: [
          {
            description: "ZIP Archive",
            accept: { "application/zip": [".zip"] },
          },
        ],
      });

      const writable: WritableStream = await handle.createWritable();
      await zipResponse.body.pipeTo(writable);
      return;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error("Save cancelled by user");
      }
      // If file picker fails for unexpected security/permission reason, fall through to Blob fallback
      console.warn("Direct-to-disk streaming failed, falling back to Blob:", err);
    }
  }

  // TIER 2: Fallback for Safari / Firefox / Mobile WebKit
  const blob = await zipResponse.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Clean up blob URL after download starts
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

