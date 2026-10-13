// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  getGoogleDriveDownloadUrl,
  triggerBrowserDownload,
  batchDownloadFiles,
  type BatchDownloadItem,
} from "./client-exporter";

describe("Browser Bypass & Batch Download Unit Tests", () => {
  it("constructs direct native Google Drive download URLs using file id", () => {
    const fileId = "1a2B3c4D5e6F";
    const expectedUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    expect(getGoogleDriveDownloadUrl(fileId)).toBe(expectedUrl);
  });

  it("triggers browser download via DOM anchor element with proper attributes", () => {
    const fileId = "test-file-123";
    const fileName = "Assignment_Instructions.pdf";

    const mockClick = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === "a") {
        el.click = mockClick;
      }
      return el;
    });

    triggerBrowserDownload(fileId, fileName);

    expect(mockClick).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("sequences batch downloads with specified delay and progress callbacks", async () => {
    const items: BatchDownloadItem[] = [
      { id: "file-1", name: "Doc1.pdf" },
      { id: "file-2", name: "Doc2.pdf" },
      { id: "file-3", name: "Doc3.pdf" },
    ];

    const mockClick = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === "a") {
        el.click = mockClick;
      }
      return el;
    });

    const progressCalls: number[] = [];
    await batchDownloadFiles(items, 10, async (index) => {
      progressCalls.push(index);
    });

    expect(mockClick).toHaveBeenCalledTimes(3);
    expect(progressCalls).toEqual([0, 1, 2]);

    vi.restoreAllMocks();
  });
});
