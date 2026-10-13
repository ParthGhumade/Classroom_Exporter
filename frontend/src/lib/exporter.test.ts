// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getGoogleDriveDownloadUrl,
  triggerBrowserDownload,
  batchDownloadFiles,
  type BatchDownloadItem,
} from "./client-exporter";
import { extractAuthUser } from "./google-classroom";

describe("Browser Bypass, Multi-Account Routing & Iframe Download Unit Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("extracts authuser query parameter from alternateLink correctly", () => {
    expect(extractAuthUser("https://drive.google.com/file/d/XYZ123/view?authuser=1")).toBe("1");
    expect(extractAuthUser("https://drive.google.com/file/d/XYZ123/view?usp=sharing&authuser=2")).toBe("2");
    expect(extractAuthUser("https://docs.google.com/document/d/ABC/edit?authuser=0#heading=h.1")).toBe("0");
    expect(extractAuthUser("https://drive.google.com/file/d/XYZ123/view")).toBeNull();
    expect(extractAuthUser(null)).toBeNull();
    expect(extractAuthUser(undefined)).toBeNull();
  });

  it("constructs native download URLs with optional authuser parameter", () => {
    const fileId = "1a2B3c4D5e6F";
    // Without authUser
    expect(getGoogleDriveDownloadUrl(fileId)).toBe(
      `https://drive.google.com/uc?export=download&id=${fileId}`
    );
    expect(getGoogleDriveDownloadUrl(fileId, null)).toBe(
      `https://drive.google.com/uc?export=download&id=${fileId}`
    );
    expect(getGoogleDriveDownloadUrl(fileId, "")).toBe(
      `https://drive.google.com/uc?export=download&id=${fileId}`
    );

    // With authUser
    expect(getGoogleDriveDownloadUrl(fileId, "1")).toBe(
      `https://drive.google.com/uc?export=download&id=${fileId}&authuser=1`
    );
    expect(getGoogleDriveDownloadUrl(fileId, "2")).toBe(
      `https://drive.google.com/uc?export=download&id=${fileId}&authuser=2`
    );
  });

  it("triggers download using window.open and detects successful popup", () => {
    const fileId = "test-doc-456";
    const fakeWindow = { closed: false } as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(fakeWindow);

    const result = triggerBrowserDownload(fileId, "Test.pdf", "1");

    expect(openSpy).toHaveBeenCalledWith(
      `https://drive.google.com/uc?export=download&id=${fileId}&authuser=1`,
      "_blank"
    );
    expect(result.success).toBe(true);
    expect(result.popupBlocked).toBe(false);
    expect(result.windowRef).toBe(fakeWindow);
  });

  it("detects popup blocker when window.open returns null or closed", () => {
    const fileId = "blocked-doc";
    vi.spyOn(window, "open").mockReturnValue(null);

    const result = triggerBrowserDownload(fileId, "Blocked.pdf");
    expect(result.success).toBe(false);
    expect(result.popupBlocked).toBe(true);
    expect(result.windowRef).toBeNull();
  });

  it("breaks the batch loop and pauses downloads when popup is blocked", async () => {
    vi.useRealTimers();

    const items: BatchDownloadItem[] = [
      { id: "file-1", name: "Doc1.pdf", authUser: "1" },
      { id: "file-2", name: "Doc2.pdf", alternateLink: "https://drive.google.com/file/d/file-2/view?authuser=2" },
      { id: "file-3", name: "Doc3.pdf" },
    ];

    let callCount = 0;
    vi.spyOn(window, "open").mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        // Second call blocked by browser popup blocker!
        return null;
      }
      return { closed: false } as Window;
    });

    const progressCalls: number[] = [];
    let blockedNotified = false;

    const result = await batchDownloadFiles(items, {
      delayMs: 5,
      onProgress: async (index) => {
        progressCalls.push(index);
      },
      onPopupBlocked: async (index) => {
        blockedNotified = true;
        expect(index).toBe(1);
      },
    });

    expect(result.popupBlocked).toBe(true);
    expect(result.completed).toBe(1); // Only first file succeeded
    expect(result.blockedIndex).toBe(1);
    expect(progressCalls).toEqual([0]);
    expect(blockedNotified).toBe(true);
    expect(callCount).toBe(2); // Broke loop immediately, did not attempt file 3
  });
});
