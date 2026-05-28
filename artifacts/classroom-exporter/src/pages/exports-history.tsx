import { useLocation } from "wouter";
import { useListExports, useGetAuthStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileCode2, Clock, ChevronRight, Archive, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ExportsHistoryPage() {
  const [, setLocation] = useLocation();
  const { data: authStatus, isLoading: authLoading } = useGetAuthStatus();
  const { data: exports, isLoading: exportsLoading } = useListExports({
    query: {
      enabled: !!authStatus?.authenticated,
      refetchInterval: 5000 // Refresh list periodically
    }
  });

  if (authLoading) return null;
  if (!authStatus?.authenticated) {
    setLocation("/");
    return null;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900 gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1.5"><XCircle className="w-3.5 h-3.5" /> Failed</Badge>;
      case "running":
        return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running</Badge>;
      case "pending":
      default:
        return <Badge variant="secondary" className="gap-1.5"><Clock className="w-3.5 h-3.5" /> Pending</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Export History</h1>
        <p className="text-muted-foreground text-lg">View past and current export jobs.</p>
      </div>

      {exportsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-64" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-8 w-24 rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : exports?.length === 0 ? (
        <Card className="bg-muted/50 border-dashed text-center py-12">
          <CardContent>
            <Archive className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">No exports yet</h3>
            <p className="text-muted-foreground">Start an export from the Courses page.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {exports?.map((job) => (
            <Card 
              key={job.id} 
              className="cursor-pointer hover-elevate transition-all border-muted hover:border-primary/40 group overflow-hidden"
              onClick={() => setLocation(`/exports/${job.id}`)}
            >
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-6">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">{job.courseName}</h3>
                      {getStatusBadge(job.status)}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5" title="Export Created">
                        <Clock className="w-4 h-4" />
                        {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                      </div>
                      
                      {job.totalFiles !== null && (
                        <div className="flex items-center gap-1.5">
                          <FileCode2 className="w-4 h-4" />
                          <span>
                            <strong className="text-foreground font-medium">{job.copiedFiles || 0}</strong> copied
                            {job.failedFiles ? <span className="text-destructive ml-1">({job.failedFiles} failed)</span> : null}
                            {" "}/ {job.totalFiles} total
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="hidden md:flex shrink-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </div>
                </div>
                {job.status === "running" && job.totalFiles ? (
                  <div className="h-1.5 w-full bg-muted">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-500 ease-in-out" 
                      style={{ width: `${Math.max(5, ((job.copiedFiles || 0) + (job.skippedFiles || 0) + (job.failedFiles || 0)) / job.totalFiles * 100)}%` }}
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
