import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getExportJob, type ExportJob, type ExportLog } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Terminal,
  FileCode2,
  Copy,
  Check,
  AlertTriangle,
  Info,
  ExternalLink,
  FolderOpen,
  Download,
  Search,
  HardDrive,
  FileText,
  Sparkles,
  ArrowDown,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function ExportDetailPage() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const { authenticated, isLoading: authLoading } = useAuth();
  const [job, setJob] = useState<ExportJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Search states
  const [activeTab, setActiveTab] = useState<"all" | "files" | "issues">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"friendly" | "raw">("friendly");
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(true);

  const logsContainerRef = useRef<HTMLDivElement>(null);
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

  // Handle auto-scroll when new logs arrive
  useEffect(() => {
    if (isAutoScroll && (job?.status === "running" || job?.status === "pending")) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [job?.logs?.length, job?.status, isAutoScroll]);

  // Detect user manual scroll to pause auto-scroll
  const handleScroll = () => {
    if (!logsContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    setIsAutoScroll(atBottom);
  };

  const scrollToBottom = () => {
    setIsAutoScroll(true);
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const copyAllLogs = () => {
    if (!job?.logs) return;
    const text = job.logs
      .map(
        (l) =>
          `[${format(new Date(l.createdAt), "yyyy-MM-dd HH:mm:ss")}] [${l.level.toUpperCase()}] ${l.message}${
            l.fileName ? ` (File: ${l.fileName})` : ""
          }${l.sourceName ? ` (Topic: ${l.sourceName})` : ""}`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  if (authLoading) return null;
  if (!authenticated) {
    setLocation("/");
    return null;
  }
  if (isNaN(id)) {
    setLocation("/exports");
    return null;
  }

  // Progress metrics calculation
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

  // Derive currently downloading file from latest logs
  const activeFileInfo = useMemo(() => {
    if (!isRunning || !job?.logs || job.logs.length === 0) return null;
    for (let i = job.logs.length - 1; i >= 0; i--) {
      const log = job.logs[i];
      if (log.message.startsWith("Fetching (")) {
        const match = log.message.match(/Fetching \((\d+\/\d+)\):\s*(.+?)\.\.\./);
        if (match) {
          return { step: match[1], name: match[2] };
        }
      }
      if (log.fileName) {
        return { name: log.fileName, step: `${processed}/${total}` };
      }
    }
    return null;
  }, [isRunning, job?.logs, processed, total]);

  // Filter logs for user display
  const filteredLogs = useMemo(() => {
    if (!job?.logs) return [];
    return job.logs.filter((log) => {
      // Tab filter
      if (activeTab === "files") {
        const isFileEvent =
          Boolean(log.fileName) ||
          log.message.includes("Packaged:") ||
          log.message.includes("Copied:") ||
          log.message.startsWith("Fetching");
        if (!isFileEvent) return false;
      } else if (activeTab === "issues") {
        if (log.level !== "warning" && log.level !== "error") return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesMsg = log.message.toLowerCase().includes(q);
        const matchesFile = log.fileName?.toLowerCase().includes(q);
        const matchesSource = log.sourceName?.toLowerCase().includes(q);
        return matchesMsg || matchesFile || matchesSource;
      }

      return true;
    });
  }, [job?.logs, activeTab, searchQuery]);

  const fileLogsCount = useMemo(() => {
    if (!job?.logs) return 0;
    return job.logs.filter(
      (l) =>
        Boolean(l.fileName) ||
        l.message.includes("Packaged:") ||
        l.message.includes("Copied:") ||
        l.message.startsWith("Fetching")
    ).length;
  }, [job?.logs]);

  const issueLogsCount = useMemo(() => {
    if (!job?.logs) return 0;
    return job.logs.filter((l) => l.level === "warning" || l.level === "error").length;
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

  // Helper for friendly log event display
  const getLogVisual = (log: ExportLog) => {
    if (log.message.includes("Created subfolder") || log.message.includes("Creating Drive folder")) {
      return {
        icon: <FolderOpen className="w-4 h-4 text-indigo-500" />,
        bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
        label: "Folder Created",
      };
    }
    if (log.level === "success") {
      return {
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        label: job?.mode === "zip" ? "Packaged" : "Copied",
      };
    }
    if (log.level === "warning") {
      return {
        icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
        bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        label: "Skipped",
      };
    }
    if (log.level === "error") {
      return {
        icon: <XCircle className="w-4 h-4 text-red-500" />,
        bg: "bg-red-500/10 text-red-700 dark:text-red-400",
        label: "Error",
      };
    }
    if (log.message.startsWith("Fetching")) {
      return {
        icon: <Download className="w-4 h-4 text-blue-500" />,
        bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
        label: "Fetching",
      };
    }
    return {
      icon: <Info className="w-4 h-4 text-muted-foreground" />,
      bg: "bg-muted text-muted-foreground",
      label: "Info",
    };
  };

  return (
    <div className="space-y-5 sm:space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Top Header Bar */}
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
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate text-foreground">
              {job?.courseName || "Export Job"}
            </h1>
            <div className="text-muted-foreground text-xs flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="font-mono bg-muted/70 px-1.5 py-0.5 rounded text-[11px]">
                Job #{id}
              </span>
              <span>•</span>
              <Badge variant="outline" className="text-[11px] font-medium py-0 px-2 uppercase tracking-wide">
                {job?.mode === "drive" ? "Google Drive" : "ZIP Download"}
              </Badge>
              {job?.createdAt && (
                <>
                  <span>•</span>
                  <span>{format(new Date(job.createdAt), "MMM d, yyyy h:mm a")}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 self-start sm:self-auto">
            {folderUrl && (
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

      {/* HERO SECTION: Live Download / Export Progress Bar */}
      <Card
        className={cn(
          "relative overflow-hidden border shadow-xs transition-all duration-300 rounded-2xl",
          isCompleted && "border-emerald-500/30 bg-emerald-500/[0.03]",
          isRunning && "border-primary/40 bg-card shadow-sm",
          isFailed && "border-destructive/30 bg-destructive/[0.03]",
          isPending && "border-border/80 bg-card"
        )}
      >
        <CardContent className="p-4 sm:p-6 space-y-4">
          {/* Progress Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {isRunning && (
                <div className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                </div>
              )}
              {isCompleted && (
                <div className="p-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
              {isFailed && (
                <div className="p-1 rounded-full bg-destructive/10 text-destructive">
                  <XCircle className="w-4 h-4" />
                </div>
              )}
              {isPending && (
                <div className="p-1 rounded-full bg-muted text-muted-foreground">
                  <Clock className="w-4 h-4" />
                </div>
              )}

              <div>
                <h2 className="text-sm sm:text-base font-semibold text-foreground">
                  {isRunning
                    ? job?.mode === "zip"
                      ? "Streaming ZIP Download..."
                      : "Exporting to Google Drive..."
                    : isCompleted
                    ? job?.mode === "zip"
                      ? "ZIP Download Completed"
                      : "Google Drive Export Completed"
                    : isFailed
                    ? "Export Interrupted"
                    : "Preparing Download Stream..."}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {isRunning
                    ? "Files are directly streamed to prevent memory overflow"
                    : isCompleted
                    ? "All selected course items have been packaged and verified"
                    : isFailed
                    ? "Check the activity log below to review any error notices"
                    : "Connecting with Google APIs..."}
                </p>
              </div>
            </div>

            {/* Percentage Display */}
            <div className="flex items-baseline gap-1.5 self-start sm:self-auto pl-5 sm:pl-0">
              <span
                className={cn(
                  "text-2xl sm:text-3xl font-extrabold tracking-tight font-mono",
                  isCompleted && "text-emerald-600 dark:text-emerald-400",
                  isRunning && "text-primary",
                  isFailed && "text-destructive",
                  isPending && "text-muted-foreground"
                )}
              >
                {percent}%
              </span>
              <span className="text-xs text-muted-foreground font-medium">completed</span>
            </div>
          </div>

          {/* Main Visual Progress Bar */}
          <div className="space-y-2">
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Download and export progress"
              className="relative h-3 sm:h-3.5 w-full bg-muted/80 rounded-full overflow-hidden p-0.5 border border-border/50 shadow-inner"
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
                {/* Subtle moving shimmer highlight while running */}
                {isRunning && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                )}
              </div>
            </div>

            {/* Live Progress Subtext Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-muted-foreground pt-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {isRunning && activeFileInfo ? (
                  <div className="flex items-center gap-1.5 truncate">
                    <Download className="w-3.5 h-3.5 text-primary shrink-0 animate-bounce" />
                    <span className="truncate">
                      Downloading:{" "}
                      <strong className="text-foreground font-medium">{activeFileInfo.name}</strong>
                    </span>
                  </div>
                ) : isCompleted ? (
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {job?.mode === "zip"
                        ? "ZIP file saved directly to your device storage"
                        : "Files ready in your Google Drive root folder"}
                    </span>
                  </div>
                ) : isFailed ? (
                  <span className="text-destructive font-medium">Download encountered an issue</span>
                ) : (
                  <span>Discovering files from Google Classroom...</span>
                )}
              </div>

              <div className="font-mono text-[11px] sm:text-xs shrink-0 flex items-center gap-2">
                <span>
                  <strong className="text-foreground font-semibold">{processed}</strong> of{" "}
                  <strong className="text-foreground font-semibold">{total}</strong> files
                </span>
                {total > processed && isRunning && (
                  <span className="text-muted-foreground/80">({total - processed} remaining)</span>
                )}
              </div>
            </div>
          </div>

          {/* Engine & Guarantee Badge Row */}
          <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-primary/80" />
                <span>Engine: {job?.mode === "zip" ? "Streaming ZIP ($O(1)$ RAM)" : "Cloud Copy"}</span>
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500/80" />
                <span>Zero Central Storage</span>
              </span>
            </div>

            {isCompleted && folderUrl && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs gap-1.5 active:scale-95 transition-all shadow-xs"
                onClick={() => window.open(folderUrl, "_blank", "noopener,noreferrer")}
              >
                <FolderOpen className="w-3.5 h-3.5" /> Open Google Drive
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <FileCode2 className="w-3.5 h-3.5 text-muted-foreground" /> Total Files
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight">{job?.totalFiles ?? "—"}</div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3 sm:p-4 flex flex-col justify-center gap-0.5">
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
          <CardContent className="p-3 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <Info className="w-3.5 h-3.5 text-blue-500" /> Skipped
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-500">
              {job?.skippedFiles ?? "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-2xs border-border/80 rounded-xl">
          <CardContent className="p-3 sm:p-4 flex flex-col justify-center gap-0.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-0.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Failed
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-red-600 dark:text-red-500">
              {job?.failedFiles ?? "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* USER-FRIENDLY ACTIVITY FEED (Replaces the terminal) */}
      <Card className="border-border/80 shadow-2xs overflow-hidden flex flex-col rounded-2xl bg-card">
        {/* Card Header with Controls */}
        <CardHeader className="bg-muted/30 border-b border-border/60 py-3 px-3 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base font-semibold">Activity Timeline</CardTitle>
              <p className="text-xs text-muted-foreground">
                Live stream of file transfers and organizational events
              </p>
            </div>
          </div>

          {/* Action buttons on header */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* View Mode Switcher */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 border-border/70 hover:bg-muted active:scale-95 transition-all touch-manipulation cursor-pointer"
              onClick={() => setViewMode(viewMode === "friendly" ? "raw" : "friendly")}
              title="Toggle between friendly timeline and technical log"
            >
              {viewMode === "friendly" ? (
                <>
                  <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Technical Log</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Friendly View</span>
                </>
              )}
            </Button>

            {/* Copy Logs */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 px-2.5 text-muted-foreground hover:text-foreground active:scale-95 transition-all touch-manipulation cursor-pointer"
              onClick={copyAllLogs}
              title="Copy all logs to clipboard"
            >
              {copiedLogs ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-500">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {/* Toolbar: Filter Tabs & Search Bar */}
        <div className="px-3 sm:px-5 py-2.5 border-b border-border/40 bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap",
                activeTab === "all"
                  ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              All Events ({job?.logs?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("files")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap",
                activeTab === "files"
                  ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              Files ({fileLogsCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("issues")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1",
                activeTab === "issues"
                  ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                issueLogsCount > 0 && activeTab !== "issues" && "text-amber-600 dark:text-amber-400 font-semibold"
              )}
            >
              Notices & Issues
              {issueLogsCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  {issueLogsCount}
                </span>
              )}
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter by file or topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-muted/30 border-border/60"
            />
          </div>
        </div>

        {/* Feed Body Container */}
        <CardContent className="p-0 relative flex-1">
          {isLoading ? (
            <div className="p-5 space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : viewMode === "friendly" ? (
            /* Friendly Timeline View */
            <div
              ref={logsContainerRef}
              onScroll={handleScroll}
              className="h-[360px] sm:h-[460px] overflow-y-auto divide-y divide-border/40 p-2 sm:p-3 space-y-1"
            >
              {filteredLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm font-medium">No matching events found</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {searchQuery ? "Try clearing your search query." : "Waiting for export activity..."}
                  </p>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const visual = getLogVisual(log);
                  const isFile = Boolean(log.fileName);

                  return (
                    <div
                      key={log.id}
                      className="p-2 sm:p-2.5 rounded-xl hover:bg-muted/40 transition-colors flex items-start gap-3 group"
                    >
                      {/* Visual Icon Badge */}
                      <div className={cn("p-2 rounded-xl shrink-0 mt-0.5", visual.bg)}>
                        {visual.icon}
                      </div>

                      {/* Content Area */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-xs sm:text-sm font-medium text-foreground break-all">
                            {isFile ? (
                              <span className="font-semibold text-foreground">{log.fileName}</span>
                            ) : (
                              <span>{log.message}</span>
                            )}
                          </span>

                          <span className="text-[10px] sm:text-[11px] text-muted-foreground/80 shrink-0 select-none">
                            {format(new Date(log.createdAt), "h:mm:ss a")}
                          </span>
                        </div>

                        {/* File detail / Topic badge / Error explanation */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {log.sourceName && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-normal py-0 px-1.5 bg-muted/80 text-muted-foreground rounded-md"
                            >
                              {log.sourceName}
                            </Badge>
                          )}

                          {isFile && (
                            <span className="text-[11px] text-muted-foreground">
                              {log.level === "success"
                                ? job?.mode === "zip"
                                  ? "Added to ZIP archive"
                                  : "Copied to Drive"
                                : log.level === "warning"
                                ? "Skipped (check permissions or format)"
                                : log.level === "error"
                                ? "Failed to transfer"
                                : "Downloading..."}
                            </span>
                          )}

                          {/* Extra log text if file was skipped with specific message */}
                          {log.level === "warning" && !isFile && (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400">
                              {log.message}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          ) : (
            /* Technical / Developer Log View */
            <div
              ref={logsContainerRef}
              onScroll={handleScroll}
              className="h-[360px] sm:h-[460px] overflow-y-auto bg-[#0F141C] p-3 sm:p-4 font-mono text-[11px] sm:text-xs leading-relaxed text-gray-300 space-y-1 rounded-b-xl"
            >
              {filteredLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-xs">
                  No technical logs recorded.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 hover:bg-white/5 p-1 rounded transition-colors"
                  >
                    <span className="text-gray-500 shrink-0 select-none text-[10px]">
                      {format(new Date(log.createdAt), "HH:mm:ss")}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] uppercase font-bold shrink-0 px-1 rounded",
                        log.level === "success" && "text-emerald-400 bg-emerald-500/10",
                        log.level === "warning" && "text-amber-400 bg-amber-500/10",
                        log.level === "error" && "text-red-400 bg-red-500/10",
                        log.level === "info" && "text-blue-400 bg-blue-500/10"
                      )}
                    >
                      {log.level}
                    </span>
                    <span className="break-all text-gray-200 flex-1">
                      {log.message}
                      {log.fileName && <span className="text-gray-400 ml-1">"{log.fileName}"</span>}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          )}

          {/* Floating "Scroll to latest" button when user scrolled up during active job */}
          {!isAutoScroll && (isRunning || isPending) && (
            <div className="absolute bottom-3 right-4 z-10">
              <Button
                size="sm"
                variant="secondary"
                onClick={scrollToBottom}
                className="h-8 text-xs gap-1 shadow-md bg-background/95 backdrop-blur-sm border border-border hover:bg-accent active:scale-95 transition-all touch-manipulation cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5 text-primary animate-bounce" />
                <span>Scroll to latest</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
