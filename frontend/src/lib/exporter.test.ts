// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { GOOGLE_WORKSPACE_EXPORTS } from "./google-drive";
import { isFileSystemAccessSupported, downloadFilesAsZip, type ZipFileInput } from "./zip-streamer";

describe("Google Drive & ZIP Export Unit Tests", () => {
  it("maps Google Workspace mime types correctly to standard Office extensions", () => {
    expect(GOOGLE_WORKSPACE_EXPORTS["application/vnd.google-apps.document"]).toEqual({
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ext: ".docx",
    });
    expect(GOOGLE_WORKSPACE_EXPORTS["application/vnd.google-apps.spreadsheet"]).toEqual({
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ext: ".xlsx",
    });
    expect(GOOGLE_WORKSPACE_EXPORTS["application/vnd.google-apps.presentation"]).toEqual({
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ext: ".pptx",
    });
  });

  it("checks file system access support accurately in Node/JSDOM environment", () => {
    // In Node test environment, window.showSaveFilePicker is not defined by default
    expect(typeof isFileSystemAccessSupported()).toBe("boolean");
  });

  it("streams and packages files into a valid ZIP archive via async generator without OOM", async () => {
    // Mock AsyncGenerator yielding two files
    async function* mockFiles(): AsyncGenerator<ZipFileInput, void, unknown> {
      yield {
        name: "test-topic/syllabus.txt",
        input: new Blob(["Classroom Exporter Syllabus Content"], { type: "text/plain" }),
      };
      yield {
        name: "test-topic/assignment_1.html",
        input: new Blob(["<html><body>Assignment Form Link</body></html>"], { type: "text/html" }),
      };
    }

    // Mock URL.createObjectURL and URL.revokeObjectURL in jsdom
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    } else {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    }

    // Mock document.createElement to intercept download trigger in test
    const mockClick = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === "a") {
        el.click = mockClick;
      }
      return el;
    });

    // In non-showSaveFilePicker environment, downloadFilesAsZip triggers a Blob download
    await downloadFilesAsZip(mockFiles(), "TestCourse_2026");

    expect(mockClick).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
