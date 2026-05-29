import { useLocation } from "wouter";
import { useGetAuthStatus, useCreateExport } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderUp, ArrowLeft, BookOpen, FolderPlus } from "lucide-react";

export default function ExportSetupPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const courseId = searchParams.get("courseId");
  const courseName = searchParams.get("courseName");

  const { data: authStatus, isLoading: authLoading } = useGetAuthStatus();
  const createExportMutation = useCreateExport();

  if (authLoading) return null;
  if (!authStatus?.authenticated) {
    setLocation("/");
    return null;
  }

  if (!courseId || !courseName) {
    setLocation("/courses");
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createExportMutation.mutate(
      { data: { courseId, courseName } },
      { onSuccess: (job) => setLocation(`/exports/${job.id}`) }
    );
  };

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
        <h1 className="text-3xl font-bold tracking-tight">Start Export</h1>
        <p className="text-muted-foreground text-lg mt-2">
          Export all Drive files from this course to a new folder in your Drive.
        </p>
      </div>

      <Card className="border-muted shadow-sm">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Export Summary</CardTitle>
            <CardDescription>
              Review the details below and click Start to begin the export.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-muted bg-muted/30 divide-y divide-muted">
              <div className="flex items-center gap-3 px-4 py-3">
                <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Course</p>
                  <p className="font-medium truncate">{courseName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <FolderPlus className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Destination folder</p>
                  <p className="font-medium text-muted-foreground italic">
                    Auto-created: "Classroom Export — {courseName}"
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              A new folder named <span className="font-medium text-foreground">"Classroom Export — {courseName}"</span> will
              be created in your Google Drive. All files from coursework, materials, and announcements will be exported into it.
            </p>
          </CardContent>
          <CardFooter className="bg-muted/30 pt-6">
            <Button
              type="submit"
              size="lg"
              className="w-full text-base font-semibold shadow-sm"
              disabled={createExportMutation.isPending}
            >
              <FolderUp className="w-5 h-5 mr-2" />
              {createExportMutation.isPending ? "Starting Export..." : "Start Export"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
