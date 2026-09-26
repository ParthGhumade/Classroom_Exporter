import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { listExportJobs, type ExportJob } from "@/lib/storage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  FileCode2,
  Clock,
  ChevronRight,
  Archive,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ExportsHistoryPage() {
  const [, setLocation] = useLocation();
  const { authenticated, isLoading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadJobs() {
      const data = await listExportJobs();
      setJobs(data);
      setIsLoading(false);
    }
    loadJobs();
  }, []);

  if (authLoading) return null;
  if (!authenticated) {
    setLocation("/");
    return null;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900 gap-1 text-[11px] sm:text-xs py-0.5 px-2"
          >
            <CheckCircle2 className="w-3 h-3" /> Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1 text-[11px] sm:text-xs py-0.5 px-2">
            <XCircle className="w-3 h-3" /> Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 gap-1 text-[11px] sm:text-xs py-0.5 px-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Running
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge variant="secondary" className="gap-1 text-[11px] sm:text-xs py-0.5 px-2">
            <Clock className="w-3 h-3" /> Pending
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Export History</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            View past and in-progress export jobs.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 text-xs sm:text-sm h-9 active:scale-95 transition-all touch-manipulation"
          onClick={() => setLocation("/courses")}
        >
          <Plus className="w-4 h-4" />
          <span>New Export</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-xl overflow-hidden">
              <CardContent className="p-4 sm:p-5 flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-48 sm:w-64" />
                  <Skeleton className="h-3.5 w-32 sm:w-48" />
                </div>
                <Skeleton className="h-7 w-20 rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="bg-muted/30 border-dashed text-center py-10 sm:py-12 rounded-2xl">
          <CardContent className="px-4">
            <Archive className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No exports yet</h3>
            <p className="text-muted-foreground text-xs sm:text-sm max-w-xs mx-auto mb-4">
              You haven't run any classroom backups yet. Choose a course to begin.
            </p>
            <Button size="sm" onClick={() => setLocation("/courses")} className="text-xs sm:text-sm">
              Browse Courses
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className="cursor-pointer hover:border-primary/50 border-border/80 bg-card hover:bg-muted/10 active:scale-[0.99] transition-all duration-150 group overflow-hidden rounded-xl shadow-2xs touch-manipulation"
              onClick={() => setLocation(`/exports/${job.id}`)}
            >
              <CardContent className="p-0">
                <div className="flex items-center justify-between p-4 sm:p-5 gap-3">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base sm:text-lg font-semibold group-hover:text-primary transition-colors truncate">
                        {job.courseName}
                      </h3>
                      {getStatusBadge(job.status)}
                      {job.mode && (
                        <Badge
                          variant="outline"
                          className="text-[10px] sm:text-[11px] uppercase font-mono tracking-wider py-0 px-1.5"
                        >
                          {job.mode}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1 shrink-0" title="Created date">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                        </span>
                      </div>

                      {job.totalFiles !== null && (
                        <div className="flex items-center gap-1 shrink-0">
                          <FileCode2 className="w-3.5 h-3.5" />
                          <span>
                            <strong className="text-foreground font-medium">{job.copiedFiles || 0}</strong>{" "}
                            {job.mode === "zip" ? "downloaded" : "copied"}
                            {job.failedFiles ? (
                              <span className="text-destructive ml-1">({job.failedFiles} failed)</span>
                            ) : null}
                            {" "}/ {job.totalFiles} files
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted/60 text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:translate-x-0.5 transition-all shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>

                {job.status === "running" && job.totalFiles ? (
                  <div className="h-1.5 w-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.max(
                          5,
                          (((job.copiedFiles || 0) + (job.skippedFiles || 0) + (job.failedFiles || 0)) /
                            job.totalFiles) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
