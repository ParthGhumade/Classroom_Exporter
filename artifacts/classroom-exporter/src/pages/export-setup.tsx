import { useState } from "react";
import { useLocation } from "wouter";
import { useGetAuthStatus, useCreateExport } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FolderUp, Download, BookOpen, CheckCircle2, Loader2, HardDrive, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "drive" | "zip";

export default function ExportSetupPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const courseId = searchParams.get("courseId");
  const courseName = searchParams.get("courseName");

  const { data: authStatus, isLoading: authLoading } = useGetAuthStatus();
  const createExportMutation = useCreateExport();
  const [mode, setMode] = useState<Mode>("drive");
  const [isZipping, setIsZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  if (authLoading) return null;
  if (!authStatus?.authenticated) { setLocation("/"); return null; }
  if (!courseId || !courseName) { setLocation("/courses"); return null; }

  const handleDriveExport = () => {
    createExportMutation.mutate(
      { data: { courseId, courseName } },
      { onSuccess: (job) => setLocation(`/exports/${job.id}`) }
    );
  };

  const handleZipDownload = async () => {
    setIsZipping(true);
    setZipError(null);
    try {
      const res = await fetch("/api/exports/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, courseName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${courseName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setZipError((err as Error).message ?? "Download failed");
    } finally {
      setIsZipping(false);
    }
  };

  const handleStart = () => {
    if (mode === "drive") handleDriveExport();
    else handleZipDownload();
  };

  const isPending = createExportMutation.isPending || isZipping;

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-3 text-muted-foreground"
          onClick={() => setLocation("/courses")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to courses
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Export Course</h1>
        <p className="text-muted-foreground text-lg mt-2">
          Choose how to export files from <span className="font-medium text-foreground">"{courseName}"</span>.
        </p>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setMode("drive")}
          className={cn(
            "relative text-left rounded-xl border-2 p-5 transition-all duration-150 focus:outline-none",
            mode === "drive"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-muted bg-card hover:border-muted-foreground/40"
          )}
        >
          {mode === "drive" && (
            <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-primary" />
          )}
          <div className="flex items-center gap-3 mb-3">
            <div className={cn(
              "rounded-lg p-2",
              mode === "drive" ? "bg-primary/10" : "bg-muted"
            )}>
              <HardDrive className={cn("w-5 h-5", mode === "drive" ? "text-primary" : "text-muted-foreground")} />
            </div>
          </div>
          <p className="font-semibold text-base leading-tight mb-1">Export to Drive</p>
          <p className="text-sm text-muted-foreground leading-snug">
            Copies files into a new Google Drive folder. Live progress log included.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode("zip")}
          className={cn(
            "relative text-left rounded-xl border-2 p-5 transition-all duration-150 focus:outline-none",
            mode === "zip"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-muted bg-card hover:border-muted-foreground/40"
          )}
        >
          {mode === "zip" && (
            <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-primary" />
          )}
          <div className="flex items-center gap-3 mb-3">
            <div className={cn(
              "rounded-lg p-2",
              mode === "zip" ? "bg-primary/10" : "bg-muted"
            )}>
              <Archive className={cn("w-5 h-5", mode === "zip" ? "text-primary" : "text-muted-foreground")} />
            </div>
          </div>
          <p className="font-semibold text-base leading-tight mb-1">Download as ZIP</p>
          <p className="text-sm text-muted-foreground leading-snug">
            Downloads all files as a single ZIP archive directly to your computer.
          </p>
        </button>
      </div>

      {/* Detail card */}
      <Card className="border-muted shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            {courseName}
          </CardTitle>
          <CardDescription>
            {mode === "drive"
              ? `A folder named "Classroom Export — ${courseName}" will be created in your Google Drive.`
              : `All accessible files will be packaged into "${courseName}.zip" and downloaded immediately.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {zipError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3">
              {zipError}
            </div>
          )}
          {isZipping && (
            <div className="rounded-lg bg-muted/60 border border-muted text-muted-foreground text-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Building ZIP — this may take a minute depending on file count…
            </div>
          )}
          <Button
            size="lg"
            className="w-full text-base font-semibold shadow-sm"
            disabled={isPending}
            onClick={handleStart}
          >
            {isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {mode === "drive" ? "Starting…" : "Building ZIP…"}
              </>
            ) : mode === "drive" ? (
              <>
                <FolderUp className="w-5 h-5 mr-2" />
                Export to Drive
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Download ZIP
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
