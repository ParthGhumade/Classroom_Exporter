import { useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useGetExport, useGetAuthStatus, getGetExportQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2, Clock,
  Terminal, FileCode2, Copy, AlertTriangle, Info,
  ExternalLink, FolderOpen,
} from "lucide-react";
import { format } from "date-fns";

export default function ExportDetailPage() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const { data: authStatus, isLoading: authLoading } = useGetAuthStatus();

  const { data: job, isLoading: jobLoading } = useGetExport(id, {
    query: {
      queryKey: getGetExportQueryKey(id),
      enabled: !!authStatus?.authenticated && !isNaN(id),
      refetchInterval: (query) => {
        const state = query.state.data;
        if (state && (state.status === "pending" || state.status === "running")) {
          return 2000;
        }
        return false;
      },
    },
  });

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (job?.status === "running" || job?.status === "pending") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [job?.logs?.length, job?.status]);

  if (authLoading) return null;
  if (!authStatus?.authenticated) {
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
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900 text-sm px-3 py-1 gap-2">
            <CheckCircle2 className="w-4 h-4" /> Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="text-sm px-3 py-1 gap-2">
            <XCircle className="w-4 h-4" /> Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-sm px-3 py-1 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Running
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge variant="secondary" className="text-sm px-3 py-1 gap-2">
            <Clock className="w-4 h-4" /> Pending
          </Badge>
        );
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case "success": return "text-green-600 dark:text-green-400";
      case "error":   return "text-red-500 dark:text-red-400";
      case "warning": return "text-amber-500 dark:text-amber-400";
      default:        return "text-blue-500 dark:text-blue-400";
    }
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case "success": return <CheckCircle2 className="w-4 h-4 shrink-0" />;
      case "error":   return <XCircle className="w-4 h-4 shrink-0" />;
      case "warning": return <AlertTriangle className="w-4 h-4 shrink-0" />;
      default:        return <Info className="w-4 h-4 shrink-0" />;
    }
  };

  const folderUrl = job?.targetFolderId
    ? `https://drive.google.com/drive/folders/${job.targetFolderId}`
    : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-500">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-3 text-muted-foreground"
          onClick={() => setLocation("/exports")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to History
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{job?.courseName || "Export Job"}</h1>
            <p className="text-muted-foreground text-sm font-mono flex items-center gap-2">
              Job #{id}
              {job?.targetFolderId ? (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="flex items-center gap-1">
                    <FolderOpen className="w-3.5 h-3.5" />
                    Folder created
                  </span>
                </>
              ) : (job?.status === "pending" || job?.status === "running") ? (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="text-muted-foreground/60 italic">creating folder…</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {folderUrl && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-sm"
                onClick={() => window.open(folderUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="w-4 h-4" />
                Open in Drive
              </Button>
            )}
            {jobLoading
              ? <Skeleton className="h-8 w-24 rounded-full" />
              : getStatusDisplay(job?.status)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card shadow-sm border-muted">
          <CardContent className="p-4 flex flex-col justify-center gap-1">
            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
              <FileCode2 className="w-4 h-4" /> Total Files
            </div>
            <div className="text-3xl font-bold">{job?.totalFiles ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-sm border-muted">
          <CardContent className="p-4 flex flex-col justify-center gap-1">
            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
              <Copy className="w-4 h-4 text-green-500" /> Copied
            </div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-500">{job?.copiedFiles ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-sm border-muted">
          <CardContent className="p-4 flex flex-col justify-center gap-1">
            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
              <Info className="w-4 h-4 text-blue-500" /> Skipped
            </div>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-500">{job?.skippedFiles ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-sm border-muted">
          <CardContent className="p-4 flex flex-col justify-center gap-1">
            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Failed
            </div>
            <div className="text-3xl font-bold text-red-600 dark:text-red-500">{job?.failedFiles ?? "—"}</div>
          </CardContent>
        </Card>
      </div>

      {job?.status === "running" && job.totalFiles ? (
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium text-muted-foreground">
            <span>Progress</span>
            <span>
              {Math.round(
                (((job.copiedFiles || 0) + (job.skippedFiles || 0) + (job.failedFiles || 0)) /
                  job.totalFiles) *
                  100
              )}%
            </span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500 ease-in-out rounded-full"
              style={{
                width: `${Math.max(
                  2,
                  (((job.copiedFiles || 0) + (job.skippedFiles || 0) + (job.failedFiles || 0)) /
                    job.totalFiles) *
                    100
                )}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      <Card className="border-muted shadow-sm overflow-hidden flex flex-col h-[500px]">
        <CardHeader className="bg-muted/30 border-b py-3 px-4 flex flex-row items-center gap-2 shrink-0">
          <Terminal className="w-5 h-5 text-muted-foreground" />
          <CardTitle className="text-base font-medium">Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-y-auto bg-[#0A0A0A] font-mono text-[13px] leading-relaxed">
          {jobLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-4 w-3/4 bg-gray-800" />
              <Skeleton className="h-4 w-1/2 bg-gray-800" />
              <Skeleton className="h-4 w-2/3 bg-gray-800" />
            </div>
          ) : job?.logs && job.logs.length > 0 ? (
            <div className="p-4 space-y-1.5">
              {job.logs.map((log) => (
                <div
                  key={log.id}
                  className="flex gap-3 hover:bg-white/5 p-1 rounded transition-colors group"
                >
                  <div className="text-gray-500 shrink-0 select-none">
                    {format(new Date(log.createdAt), "HH:mm:ss")}
                  </div>
                  <div className={`flex items-start gap-2 ${getLogColor(log.level)}`}>
                    <div className="mt-0.5">{getLogIcon(log.level)}</div>
                  </div>
                  <div className="text-gray-300 break-words flex-1">
                    <span className="text-gray-100">{log.message}</span>
                    {log.fileName && (
                      <span className="ml-2 text-gray-400">"{log.fileName}"</span>
                    )}
                    {log.sourceName && (
                      <span className="ml-2 text-gray-500 text-xs">[via {log.sourceName}]</span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              No logs generated yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
