import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { createExportJob } from "@/lib/storage";
import { runDriveExport, runZipDownload } from "@/lib/client-exporter";
import { discoverCourseFiles, type DriveFileRef } from "@/lib/google-classroom";
import { isFileSystemAccessSupported } from "@/lib/zip-streamer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  FolderUp,
  Download,
  BookOpen,
  CheckCircle2,
  Loader2,
  HardDrive,
  Archive,
  Folder,
  FileText,
  Sparkles,
  Info,
  CheckSquare,
  Square,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "drive" | "zip";

export default function ExportSetupPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const courseId = searchParams.get("courseId");
  const courseName = searchParams.get("courseName");

  const { authenticated, accessToken, user, isLoading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("zip");
  const [isStarting, setIsStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected file IDs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Discover all files for this course
  const {
    data: files,
    isLoading: filesLoading,
    error: filesError,
  } = useQuery({
    queryKey: ["course_files_preview", courseId, accessToken],
    queryFn: () => discoverCourseFiles(accessToken!, courseId!),
    enabled: authenticated && Boolean(accessToken) && Boolean(courseId),
  });

  // Initialize selected IDs with all files when loaded
  useEffect(() => {
    if (files) {
      setSelectedIds(new Set(files.map((f) => f.id)));
    }
  }, [files]);

  // Group files by topic/assignment
  const groupedFiles = useMemo(() => {
    if (!files) return new Map<string, DriveFileRef[]>();
    const map = new Map<string, DriveFileRef[]>();
    for (const file of files) {
      const topic = file.sourceName || "General Materials";
      if (!map.has(topic)) map.set(topic, []);
      map.get(topic)!.push(file);
    }
    return map;
  }, [files]);

  if (authLoading) return null;
  if (!authenticated) {
    setLocation("/");
    return null;
  }
  if (!courseId || !courseName) {
    setLocation("/courses");
    return null;
  }

  const toggleFile = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleTopic = (topicFiles: DriveFileRef[]) => {
    const allSelected = topicFiles.every((f) => selectedIds.has(f.id));
    const next = new Set(selectedIds);
    for (const f of topicFiles) {
      if (allSelected) {
        next.delete(f.id);
      } else {
        next.add(f.id);
      }
    }
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (!files) return;
    setSelectedIds(new Set(files.map((f) => f.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const directDiskStreaming = isFileSystemAccessSupported();

  const handleStart = async () => {
    if (!accessToken) return;
    if (selectedIds.size === 0) {
      setErrorMsg("Please select at least one file to export.");
      return;
    }

    setIsStarting(true);
    setErrorMsg(null);

    const chosenFileIds = Array.from(selectedIds);

    try {
      const job = await createExportJob({
        courseId,
        courseName,
        mode,
        userEmail: user?.email,
      });

      // Start client-orchestrated export with selected files in background
      if (mode === "drive") {
        runDriveExport(job.id, courseId, courseName, accessToken, undefined, chosenFileIds).catch(
          (err) => {
            console.error("Export error:", err);
          }
        );
      } else {
        runZipDownload(job.id, courseId, courseName, accessToken, undefined, chosenFileIds).catch(
          (err) => {
            console.error("ZIP download error:", err);
          }
        );
      }

      // Navigate to detail page to view live progress
      setLocation(`/exports/${job.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to start export");
      setIsStarting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6 animate-in fade-in duration-300">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 px-2.5 text-muted-foreground hover:text-foreground h-9 gap-1.5 text-xs sm:text-sm active:scale-95 transition-all touch-manipulation"
          onClick={() => setLocation("/courses")}
        >
          <ArrowLeft className="w-4 h-4" /> Back to courses
        </Button>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Export Course</h1>
        <p className="text-muted-foreground text-sm sm:text-base mt-1">
          Select files and choose export destination for{" "}
          <span className="font-semibold text-foreground">"{courseName}"</span>.
        </p>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setMode("zip")}
          className={cn(
            "relative text-left rounded-xl border-2 p-4 sm:p-5 transition-all duration-150 focus:outline-none cursor-pointer active:scale-[0.98] touch-manipulation",
            mode === "zip"
              ? "border-primary bg-primary/5 shadow-xs"
              : "border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/10"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div
              className={cn(
                "rounded-lg p-2.5 shrink-0",
                mode === "zip" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              <Archive className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm sm:text-base leading-tight mb-1 text-foreground">
                  Download as ZIP
                </p>
                {mode === "zip" && (
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-1" />
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
                Streams files directly to your device into a single organized .zip archive.
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMode("drive")}
          className={cn(
            "relative text-left rounded-xl border-2 p-4 sm:p-5 transition-all duration-150 focus:outline-none cursor-pointer active:scale-[0.98] touch-manipulation",
            mode === "drive"
              ? "border-primary bg-primary/5 shadow-xs"
              : "border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/10"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div
              className={cn(
                "rounded-lg p-2.5 shrink-0",
                mode === "drive" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm sm:text-base leading-tight mb-1 text-foreground">
                  Export to Drive
                </p>
                {mode === "drive" && (
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-1" />
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
                Copies files directly in Google Cloud into an organized Drive folder (zero device RAM).
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Memory & Engine Notice */}
      {mode === "zip" && (
        <div
          className={cn(
            "p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5",
            directDiskStreaming
              ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
          )}
        >
          {directDiskStreaming ? (
            <>
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Direct-to-Disk Streaming Active:</span> When you start
                the download, your browser will prompt where to save the .zip file. Chunks stream
                directly to disk with constant O(1) memory (&lt;15 MB RAM).
              </div>
            </>
          ) : (
            <>
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Mobile / WebKit Mode:</span> Please keep this tab active
                while downloading. For courses with large videos (&gt;100 MB),{" "}
                <span className="font-semibold underline cursor-pointer" onClick={() => setMode("drive")}>
                  Export to Drive
                </span>{" "}
                is recommended.
              </div>
            </>
          )}
        </div>
      )}

      {/* File Selection Filter Card */}
      <Card className="border-border/80 shadow-2xs rounded-xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/60 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Folder className="w-4 h-4 text-primary shrink-0" />
                <span>Course Content & Materials</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-0.5">
                {filesLoading
                  ? "Scanning course coursework, materials, and announcements..."
                  : `${selectedIds.size} of ${files?.length ?? 0} files selected for export.`}
              </CardDescription>
            </div>

            {files && files.length > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                  className="h-8 px-2.5 text-xs"
                >
                  <CheckSquare className="w-3.5 h-3.5 mr-1" /> All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deselectAll}
                  className="h-8 px-2.5 text-xs"
                >
                  <Square className="w-3.5 h-3.5 mr-1" /> None
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-4 space-y-5">
          {filesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-4 h-4 rounded" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : filesError ? (
            <div className="text-destructive text-sm p-4 bg-destructive/10 rounded-lg">
              Failed to load course files: {(filesError as Error).message}
            </div>
          ) : !files || files.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No Drive materials or coursework files found in this course.
            </div>
          ) : (
            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
              {Array.from(groupedFiles.entries()).map(([topicName, topicFiles]) => {
                const allTopicSelected = topicFiles.every((f) => selectedIds.has(f.id));
                const someTopicSelected =
                  !allTopicSelected && topicFiles.some((f) => selectedIds.has(f.id));

                return (
                  <div
                    key={topicName}
                    className="border border-border/70 rounded-xl p-3 sm:p-3.5 bg-card/60 space-y-2.5"
                  >
                    {/* Topic Header with Batch Checkbox */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-foreground cursor-pointer select-none">
                        <Checkbox
                          checked={allTopicSelected ? true : someTopicSelected ? "indeterminate" : false}
                          onCheckedChange={() => toggleTopic(topicFiles)}
                        />
                        <span className="truncate">{topicName}</span>
                      </label>
                      <Badge variant="secondary" className="text-[10px] sm:text-xs shrink-0 px-2 py-0">
                        {topicFiles.length} {topicFiles.length === 1 ? "file" : "files"}
                      </Badge>
                    </div>

                    {/* File List in Topic */}
                    <div className="space-y-1.5 pl-6 border-l border-border/60 ml-2">
                      {topicFiles.map((file) => {
                        const isChecked = selectedIds.has(file.id);
                        return (
                          <label
                            key={file.id}
                            className={cn(
                              "flex items-center gap-2.5 p-1.5 rounded-lg text-xs sm:text-sm cursor-pointer transition-colors select-none",
                              isChecked ? "text-foreground hover:bg-muted/50" : "text-muted-foreground/80 hover:bg-muted/30"
                            )}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleFile(file.id)}
                            />
                            <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate flex-1" title={file.name}>
                              {file.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs sm:text-sm p-3">
              {errorMsg}
            </div>
          )}

          {/* Action CTA Button */}
          <Button
            size="lg"
            className="w-full h-11 sm:h-12 text-sm sm:text-base font-semibold shadow-xs active:scale-[0.98] transition-all touch-manipulation cursor-pointer"
            disabled={isStarting || filesLoading || selectedIds.size === 0}
            onClick={handleStart}
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin" />
                Starting Export…
              </>
            ) : mode === "drive" ? (
              <>
                <FolderUp className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Export {selectedIds.size} {selectedIds.size === 1 ? "File" : "Files"} to Drive
              </>
            ) : (
              <>
                <Download className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Download {selectedIds.size} {selectedIds.size === 1 ? "File" : "Files"} as ZIP
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
