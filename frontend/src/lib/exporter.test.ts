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

  it("triggers download using an invisible iframe and removes it after 10 seconds", () => {
    const fileId = "test-doc-456";
    const iframe = triggerBrowserDownload(fileId, "Test.pdf", "1");

    expect(iframe).not.toBeNull();
    expect(iframe?.style.display).toBe("none");
    expect(iframe?.src).toBe(`https://drive.google.com/uc?export=download&id=${fileId}&authuser=1`);
    expect(document.body.contains(iframe)).toBe(true);

    // Advance timers by 9 seconds - iframe still in DOM
    vi.advanceTimersByTime(9000);
    expect(document.body.contains(iframe)).toBe(true);

    // Advance past 10 seconds - iframe should be removed from DOM
    vi.advanceTimersByTime(1001);
    expect(document.body.contains(iframe)).toBe(false);
  });

  it("sequences batch downloads with delay and attaches authuser to each file", async () => {
    vi.useRealTimers(); // Use real timers for the async generator loop test

    const items: BatchDownloadItem[] = [
      { id: "file-1", name: "Doc1.pdf", authUser: "1" },
      { id: "file-2", name: "Doc2.pdf", alternateLink: "https://drive.google.com/file/d/file-2/view?authuser=2" },
      { id: "file-3", name: "Doc3.pdf" },
    ];

    const progressCalls: number[] = [];
    await batchDownloadFiles(items, 10, async (index) => {
      progressCalls.push(index);
    });

    const iframes = document.querySelectorAll("iframe");
    expect(iframes.length).toBe(3);
    expect(iframes[0].src).toContain("id=file-1&authuser=1");
    expect(iframes[1].src).toContain("id=file-2&authuser=2");
    expect(iframes[2].src).toContain("id=file-3");
    expect(iframes[2].src).not.toContain("authuser=");
    expect(progressCalls).toEqual([0, 1, 2]);
  });
});
