import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getExportJob, type ExportJob } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Terminal,
  FileCode2,
  Copy,
  AlertTriangle,
  Info,
  ExternalLink,
  FolderOpen,
} from "lucide-react";
import { format } from "date-fns";

export default function ExportDetailPage() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const { authenticated, isLoading: authLoading } = useAuth();
  const [job, setJob] = useState<ExportJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (job?.status === "running" || job?.status === "pending") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [job?.logs?.length, job?.status]);

  if (authLoading) return null;
  if (!authenticated) {
    setLocation("/");
    return null;
  }
  if (isNaN(id)) {
    setLocation("/exports");
    return null;
  }

  const getStatusDisplay = (status?: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900 text-xs sm:text-sm px-2.5 sm:px-3 py-1 gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="text-xs sm:text-sm px-2.5 sm:px-3 py-1 gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm px-2.5 sm:px-3 py-1 gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge variant="secondary" className="text-xs sm:text-sm px-2.5 sm:px-3 py-1 gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Pending
          </Badge>
        );
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case "success":
        return "text-green-400";
      case "error":
        return "text-red-400";
      case "warning":
        return "text-amber-400";
      default:
        return "text-blue-400";
    }
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case "success":
        return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />;
      case "error":
        return <XCircle className="w-3.5 h-3.5 shrink-0" />;
      case "warning":
        return <AlertTriangle className="w-3.5 h-3.5 shrink-0" />;
      default:
        return <Info className="w-3.5 h-3.5 shrink-0" />;
    }
  };

  const folderUrl = job?.targetFolderId
    ? `https://drive.google.com/drive/folders/${job.targetFolderId}`
    : null;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 sm:mb-3 px-2.5 text-muted-foreground hover:text-foreground h-9 gap-1.5 text-xs sm:text-sm active:scale-95 transition-all touch-manipulation"
          onClick={() => setLocation("/exports")}
        >
          <ArrowLeft className="w-4 h-4" /> Back to History
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
              {job?.courseName || "Export Job"}
            </h1>
            <div className="text-muted-foreground text-xs font-mono flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span>Job #{id}</span>
              {job?.mode && (
                <>
                  <span>•</span>
                  <span className="capitalize">{job.mode === "drive" ? "Google Drive" : "ZIP Download"}</span>
                </>
              )}
              {job?.targetFolderId ? (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-primary">
                    <FolderOpen className="w-3 h-3" />
                    Folder created
                  </span>
                </>
              ) : job?.mode === "drive" && (job?.status === "pending" || job?.status === "running") ? (
                <>
                  <span>•</span>
                  <span className="italic">creating folder…</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 self-start sm:self-auto">
            {folderUrl && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs sm:text-sm h-8 sm:h-9 active:scale-95 transition-all touch-manipulation"
                onClick={() => window.open(folderUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Drive</span>
              </Button>
            )}
            {isLoading ? (
              <Skeleton className="h-8 w-20 rounded-full" />
            ) : (
              getStatusDisplay(job?.status)
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid - 2x2 on mobile, 4 in row on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <FileCode2 className="w-3.5 h-3.5" /> Total Files
            </div>
            <div className="text-xl sm:text-2xl font-bold">{job?.totalFiles ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <Copy className="w-3.5 h-3.5 text-green-500" /> {job?.mode === "zip" ? "Downloaded" : "Copied"}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-500">
              {job?.copiedFiles ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <Info className="w-3.5 h-3.5 text-blue-500" /> Skipped
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-500">
              {job?.skippedFiles ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Failed
            </div>
            <div className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-500">
              {job?.failedFiles ?? "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      {job?.status === "running" && job.totalFiles ? (
        <div className="space-y-1.5 bg-muted/40 p-3 rounded-xl border border-border/60">
          <div className="flex justify-between text-xs font-medium text-muted-foreground">
            <span>Overall Progress</span>
            <span className="font-mono">
              {Math.min(
                100,
                Math.round(
                  (((job.copiedFiles || 0) + (job.skippedFiles || 0) + (job.failedFiles || 0)) /
                    job.totalFiles) *
                    100
                )
              )}
              %
            </span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
              style={{
                width: `${Math.max(
                  3,
                  Math.min(
                    100,
                    (((job.copiedFiles || 0) + (job.skippedFiles || 0) + (job.failedFiles || 0)) /
                      job.totalFiles) *
                      100
                  )
                )}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Activity Log Terminal */}
      <Card className="border-border/80 shadow-2xs overflow-hidden flex flex-col h-[340px] sm:h-[460px] rounded-xl">
        <CardHeader className="bg-muted/40 border-b border-border/60 py-2.5 px-3 sm:px-4 flex flex-row items-center gap-2 shrink-0">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-xs sm:text-sm font-semibold">Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-y-auto bg-[#0C0E12] font-mono text-[11px] sm:text-[12px] leading-relaxed">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-3.5 w-3/4 bg-gray-800" />
              <Skeleton className="h-3.5 w-1/2 bg-gray-800" />
              <Skeleton className="h-3.5 w-2/3 bg-gray-800" />
            </div>
          ) : job?.logs && job.logs.length > 0 ? (
            <div className="p-3 sm:p-4 space-y-1.5">
              {job.logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 hover:bg-white/5 p-1 rounded transition-colors group"
                >
                  <div className="text-gray-500 shrink-0 select-none text-[10px] sm:text-[11px] pt-0.5">
                    {format(new Date(log.createdAt), "HH:mm:ss")}
                  </div>
                  <div className={`mt-0.5 ${getLogColor(log.level)}`}>
                    {getLogIcon(log.level)}
                  </div>
                  <div className="text-gray-300 break-words flex-1 min-w-0">
                    <span className="text-gray-100">{log.message}</span>
                    {log.fileName && (
                      <span className="ml-1.5 text-gray-400 font-sans text-[11px] underline-offset-2">
                        "{log.fileName}"
                      </span>
                    )}
                    {log.sourceName && (
                      <span className="ml-1.5 text-gray-500 text-[10px] bg-white/5 px-1 rounded">
                        {log.sourceName}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 text-xs">
              No logs generated yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
