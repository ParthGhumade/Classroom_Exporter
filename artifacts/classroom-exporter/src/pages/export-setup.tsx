import { useState } from "react";
import { useLocation } from "wouter";
import { useGetAuthStatus, useCreateExport } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderUp, ArrowLeft, Info } from "lucide-react";

export default function ExportSetupPage() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const courseId = searchParams.get("courseId");
  const courseName = searchParams.get("courseName");

  const { data: authStatus, isLoading: authLoading } = useGetAuthStatus();
  const createExportMutation = useCreateExport();
  const [targetFolderId, setTargetFolderId] = useState("");

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
    if (!targetFolderId.trim()) return;

    createExportMutation.mutate({
      data: {
        courseId,
        courseName,
        targetFolderId: targetFolderId.trim()
      }
    }, {
      onSuccess: (job) => {
        setLocation(`/exports/${job.id}`);
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-3 text-muted-foreground" onClick={() => setLocation("/courses")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to courses
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Configure Export</h1>
        <p className="text-muted-foreground text-lg mt-2">Set up your export destination for "{courseName}".</p>
      </div>

      <Card className="border-muted shadow-sm">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Destination Folder</CardTitle>
            <CardDescription>Enter the ID of the Google Drive folder where files should be copied.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="targetFolderId" className="text-sm font-medium">Google Drive Folder ID</Label>
              <div className="flex gap-3">
                <Input 
                  id="targetFolderId" 
                  value={targetFolderId} 
                  onChange={(e) => setTargetFolderId(e.target.value)}
                  placeholder="e.g. 1BxiMVs0XRY5nAWdWKCEmVpAM8t_Z..." 
                  className="font-mono text-sm bg-background"
                  required
                />
              </div>
            </div>

            <div className="bg-primary/5 text-primary border border-primary/10 rounded-lg p-4 flex gap-3 text-sm">
              <Info className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">How to find your Folder ID</p>
                <p className="text-primary/80">Open your destination folder in Google Drive. The ID is the long string of characters at the end of the URL:<br/><br/><code className="bg-primary/10 px-1.5 py-0.5 rounded text-xs select-all">drive.google.com/drive/folders/<b>YOUR_FOLDER_ID</b></code></p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 pt-6">
            <Button 
              type="submit" 
              size="lg" 
              className="w-full text-base font-semibold shadow-sm"
              disabled={!targetFolderId.trim() || createExportMutation.isPending}
            >
              <FolderUp className="w-5 h-5 mr-2" />
              {createExportMutation.isPending ? "Starting Export..." : "Start Export Job"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
