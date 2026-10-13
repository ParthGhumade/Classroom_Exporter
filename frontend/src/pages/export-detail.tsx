import { useEffect, useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getExportJob, type ExportJob } from "@/lib/storage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  FileCode2,
  AlertTriangle,
  Info,
  ExternalLink,
  FolderOpen,
  Download,
  Sparkles,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ExportDetailPage() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const { authenticated, isLoading: authLoading } = useAuth();
  const [job, setJob] = useState<ExportJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Poll for job updates while it is running or pending
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function fetchJob() {
      if (isNaN(id) || id <= 0) return;
      const found = await getExportJob(id);
      if (found) {
        setJob(found);
      }
      setIsLoading(false);
    }

    fetchJob();

    interval = setInterval(async () => {
      const found = await getExportJob(id);
      if (found) {
        setJob(found);
        if (found.status === "completed" || found.status === "failed") {
          clearInterval(interval);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [id]);

  if (authLoading) return null;
  if (!authenticated) {
    setLocation("/");
    return null;
  }
  if (isNaN(id)) {
    setLocation("/exports");
    return null;
  }

  // Progress calculations
  const total = job?.totalFiles || 0;
  const copied = job?.copiedFiles || 0;
  const skipped = job?.skippedFiles || 0;
  const failed = job?.failedFiles || 0;
  const processed = copied + skipped + failed;

  const isCompleted = job?.status === "completed";
  const isFailed = job?.status === "failed";
  const isRunning = job?.status === "running";
  const isPending = job?.status === "pending";

  const percent = isCompleted
    ? 100
    : total > 0
    ? Math.min(100, Math.round((processed / total) * 100))
    : 0;

  // Find currently downloading file name if in progress
  const activeFileName = useMemo(() => {
    if (!isRunning || !job?.logs || job.logs.length === 0) return null;
    for (let i = job.logs.length - 1; i >= 0; i--) {
      const log = job.logs[i];
      if (log.message.startsWith("Fetching (")) {
        const match = log.message.match(/Fetching \(\d+\/\d+\):\s*(.+?)\.\.\./);
        if (match) return match[1];
      }
      if (log.fileName) return log.fileName;
    }
    return null;
  }, [isRunning, job?.logs]);

  // Check if export stopped due to popup blocker
  const popupBlocked = useMemo(() => {
    if (!job?.logs) return false;
    return job.logs.some((l) =>
      l.message.includes("Downloads Paused: Browser popup blocker blocked window.open")
    );
  }, [job?.logs]);

  // Collect skipped or failed files for simple notice if needed
  const issueFiles = useMemo(() => {
    if (!job?.logs) return [];
    return job.logs.filter((l) => l.level === "warning" || l.level === "error");
  }, [job?.logs]);

  const folderUrl = job?.targetFolderId
    ? `https://drive.google.com/drive/folders/${job.targetFolderId}`
    : null;

  const getStatusBadge = () => {
    switch (job?.status) {
      case "completed":
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 text-xs sm:text-sm px-2.5 sm:px-3 py-1 gap-1.5 font-medium shadow-2xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="text-xs sm:text-sm px-2.5 sm:px-3 py-1 gap-1.5 font-medium shadow-2xs">
            <XCircle className="w-3.5 h-3.5" /> Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="default" className="bg-primary hover:bg-primary/90 text-xs sm:text-sm px-2.5 sm:px-3 py-1 gap-1.5 font-medium shadow-2xs animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> In Progress
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge variant="secondary" className="text-xs sm:text-sm px-2.5 sm:px-3 py-1 gap-1.5 font-medium shadow-2xs">
            <Clock className="w-3.5 h-3.5" /> Initializing
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 max-w-4xl mx-auto animate-in fade-in duration-300">
      {/* Top Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 sm:mb-3 px-2.5 text-muted-foreground hover:text-foreground h-9 gap-1.5 text-xs sm:text-sm active:scale-95 transition-all touch-manipulation cursor-pointer"
          onClick={() => setLocation("/exports")}
        >
          <ArrowLeft className="w-4 h-4" /> Back to History
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate text-foreground">
              {job?.courseName || "Export Job"}
            </h1>
            <div className="pt-0.5">
              <Badge variant="outline" className="text-[11px] font-medium py-0.5 px-2 uppercase tracking-wide">
                {job?.mode === "download"
                  ? "Direct Download"
                  : job?.mode === "drive"
                  ? "Google Drive"
                  : "ZIP Download"}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 self-start sm:self-auto">
            {job?.mode === "drive" && folderUrl && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs sm:text-sm h-8 sm:h-9 active:scale-95 transition-all touch-manipulation cursor-pointer border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => window.open(folderUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Drive</span>
              </Button>
            )}
            {isLoading ? <Skeleton className="h-8 w-24 rounded-full" /> : getStatusBadge()}
          </div>
        </div>
      </div>

      {/* Main Live Progress Hero Card */}
      <Card
        className={cn(
          "relative overflow-hidden border shadow-xs transition-all duration-300 rounded-2xl",
          isCompleted && "border-emerald-500/30 bg-emerald-500/[0.03]",
          isRunning && "border-primary/40 bg-card shadow-sm",
          isFailed && "border-destructive/30 bg-destructive/[0.03]",
          isPending && "border-border/80 bg-card"
        )}
      >
        <CardContent className="p-5 sm:p-7 space-y-5">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {isRunning && (
                <div className="relative flex h-3.5 w-3.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary" />
                </div>
              )}
              {isCompleted && (
                <div className="p-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              )}
              {isFailed && (
                <div className="p-1.5 rounded-full bg-destructive/10 text-destructive">
                  <XCircle className="w-5 h-5" />
                </div>
              )}
              {isPending && (
                <div className="p-1.5 rounded-full bg-muted text-muted-foreground">
                  <Clock className="w-5 h-5" />
                </div>
              )}

              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">
                  {isRunning
                    ? "Opening Course Files in Browser..."
                    : isCompleted
                    ? "Export Completed"
                    : isFailed
                    ? "Export Stopped"
                    : "Preparing Export..."}
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {isRunning
                    ? "Opening course files in new tabs. Click the Download icon in each tab to save them."
                    : isCompleted
                    ? "All selected files have been opened in your browser."
                    : isFailed
                    ? "Export was paused or encountered an issue. You can retry anytime."
                    : "Connecting to Google Classroom..."}
                </p>
              </div>
            </div>

            {/* Percentage Display */}
            <div className="flex items-baseline gap-1.5 self-start sm:self-auto pl-6 sm:pl-0">
              <span
                className={cn(
                  "text-3xl sm:text-4xl font-extrabold tracking-tight font-mono",
                  isCompleted && "text-emerald-600 dark:text-emerald-400",
                  isRunning && "text-primary",
                  isFailed && "text-destructive",
                  isPending && "text-muted-foreground"
                )}
              >
                {percent}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2.5">
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Export progress"
              className="relative h-3.5 sm:h-4 w-full bg-muted/80 rounded-full overflow-hidden p-0.5 border border-border/50 shadow-inner"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden",
                  isCompleted && "bg-emerald-500",
                  isFailed && "bg-destructive",
                  (isRunning || isPending) && "bg-primary"
                )}
                style={{
                  width: `${Math.max(isRunning && percent === 0 ? 5 : 0, percent)}%`,
                }}
              >
                {isRunning && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                )}
              </div>
            </div>

            {/* Subtext Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5 min-w-0">
                {isRunning && activeFileName ? (
                  <div className="flex items-center gap-1.5 truncate">
                    <Download className="w-3.5 h-3.5 text-primary shrink-0 animate-bounce" />
                    <span className="truncate">
                      Downloading: <strong className="text-foreground font-medium">{activeFileName}</strong>
                    </span>
                  </div>
                ) : isCompleted ? (
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {job?.mode === "drive"
                        ? "Files ready in your Google Drive folder"
                        : "Files saved directly to your local downloads"}
                    </span>
                  </div>
                ) : isFailed ? (
                  <span className="text-destructive font-medium">Export encountered an issue</span>
                ) : (
                  <span>Discovering files from course...</span>
                )}
              </div>

              <div className="font-mono text-xs shrink-0 flex items-center gap-2">
                <span>
                  <strong className="text-foreground font-semibold">{processed}</strong> of{" "}
                  <strong className="text-foreground font-semibold">{total}</strong> files
                </span>
                {total > processed && isRunning && (
                  <span className="text-muted-foreground">({total - processed} left)</span>
                )}
              </div>
            </div>
          </div>

          {/* Popup Blocker Alert / Warning */}
          {popupBlocked && (
            <div className="rounded-xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-900 dark:text-amber-100 text-xs sm:text-sm p-4 sm:p-5 flex items-start gap-3.5 shadow-sm animate-in fade-in duration-200">
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="font-semibold text-sm sm:text-base leading-snug">
                  ⚠️ Downloads Paused: Your browser's popup blocker stopped the batch export.
                </p>
                <p className="leading-relaxed opacity-95 text-xs sm:text-sm">
                  To download your files, click the popup-blocker icon in your browser's address bar (usually a small window with a red 'X' on the right side), select 'Always allow pop-ups from this site', and click Export again.
                </p>
                <div className="pt-1">
                  <Button
                    size="sm"
                    className="h-8 text-xs font-semibold gap-1.5 cursor-pointer shadow-xs"
                    onClick={() => {
                      if (job?.courseId) {
                        setLocation(`/export?courseId=${encodeURIComponent(job.courseId)}&courseName=${encodeURIComponent(job.courseName)}`);
                      }
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Click Export Again</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isRunning && !popupBlocked && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs sm:text-sm p-3.5 flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span className="leading-snug">
                ⚠️ If your browser blocks the downloads, click the popup-blocker icon in your address bar and select &quot;Always allow&quot;.
              </span>
            </div>
          )}

          {/* Action Buttons on Completion */}
          {isCompleted && (
            <div className="pt-3 border-t border-border/40 flex flex-wrap items-center gap-3">
              {folderUrl && (
                <Button
                  className="gap-2 shadow-sm cursor-pointer"
                  onClick={() => window.open(folderUrl, "_blank", "noopener,noreferrer")}
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Open in Google Drive</span>
                </Button>
              )}
              <Button
                variant="outline"
                className="gap-1.5 cursor-pointer"
                onClick={() => setLocation("/courses")}
              >
                <Plus className="w-4 h-4" />
                <span>Export Another Course</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <FileCode2 className="w-3.5 h-3.5 text-muted-foreground" /> Total Files
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight">{job?.totalFiles ?? "—"}</div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{" "}
              {job?.mode === "zip" ? "Downloaded" : "Copied"}
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-500">
              {job?.copiedFiles ?? "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <Info className="w-3.5 h-3.5 text-blue-500" /> Skipped
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-500">
              {job?.skippedFiles ?? "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3.5 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Failed
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-red-600 dark:text-red-500">
              {job?.failedFiles ?? "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clean Skipped Files Notice (Only shown if files were skipped or failed) */}
      {issueFiles.length > 0 && (
        <Card className="border-border/80 shadow-2xs rounded-xl overflow-hidden bg-card">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <h3 className="font-semibold text-sm">Notice: Some files were skipped</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Certain files (such as student submissions or restricted permissions) cannot be copied directly and were skipped.
            </p>
            <div className="divide-y divide-border/40 border border-border/50 rounded-lg overflow-hidden bg-muted/20">
              {issueFiles.map((issue) => (
                <div key={issue.id} className="p-2.5 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {issue.fileName || issue.message}
                    </div>
                    {issue.sourceName && (
                      <div className="text-[11px] text-muted-foreground">{issue.sourceName}</div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
                    Skipped
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
