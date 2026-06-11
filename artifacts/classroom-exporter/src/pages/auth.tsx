import { useLocation } from "wouter";
import { useGetAuthStatus, useGetAuthUrl } from "@workspace/api-client-react";
import { SiGoogleclassroom, SiGoogledrive } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Lock, Folders, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { data: authStatus, isLoading: authLoading } = useGetAuthStatus();
  const { data: authUrl, isLoading: urlLoading } = useGetAuthUrl();

  if (authStatus?.authenticated) {
    setLocation("/courses");
    return null;
  }

  const handleConnect = () => {
    if (authUrl?.url) {
      try {
        const url = new URL(authUrl.url);
        if (url.hostname === "accounts.google.com") {
          window.location.href = authUrl.url;
        } else {
          console.error("Invalid authentication URL domain.");
        }
      } catch (err) {
        console.error("Invalid URL returned from server.");
      }
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-12">
      <div className="max-w-5xl w-full grid md:grid-cols-2 gap-12 items-center flex-1">
        <div className="space-y-8">
          <div>
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-xl mb-6 text-primary">
              <SiGoogleclassroom className="w-8 h-8" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-foreground leading-tight">
              Archive your classroom with precision.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Classroom Exporter connects to your Google Account to back up all course materials, Drive files, and assignments directly into a chosen folder. Set it and forget it.
            </p>
          </div>

          <div className="space-y-6 pt-4">
            <div className="flex gap-4">
              <div className="mt-1 p-2 bg-muted rounded-lg text-primary"><Folders className="w-5 h-5" /></div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Complete Course Backup</h3>
                <p className="text-muted-foreground leading-relaxed">Exports all attached Drive files from assignments, announcements, and materials.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="mt-1 p-2 bg-muted rounded-lg text-primary"><Zap className="w-5 h-5" /></div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Organized Output</h3>
                <p className="text-muted-foreground leading-relaxed">Maintains folder structures and copies files cleanly to your specified destination.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="mt-1 p-2 bg-muted rounded-lg text-primary"><Lock className="w-5 h-5" /></div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Secure Access</h3>
                <p className="text-muted-foreground leading-relaxed">Requires read access to Classroom and write access to Drive. We don't store your files.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <Card className="w-full max-w-md shadow-xl border-muted/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="text-center pb-2 pt-8">
              <CardTitle className="text-2xl font-bold">Connect Account</CardTitle>
              <CardDescription className="text-base">Authorize access to get started</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 pt-6 pb-8 px-8">
              <div className="flex justify-center items-center gap-6 text-muted-foreground">
                <div className="p-4 bg-background rounded-2xl shadow-sm border">
                  <SiGoogleclassroom className="w-10 h-10 text-[#008375]" />
                </div>
                <ArrowRight className="w-6 h-6 text-muted-foreground/50" />
                <div className="p-4 bg-background rounded-2xl shadow-sm border">
                  <SiGoogledrive className="w-10 h-10 text-[#1FA463]" />
                </div>
              </div>
              
              <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl text-sm text-center text-muted-foreground leading-relaxed">
                You will be redirected to Google to grant permissions for Classroom Exporter to read your courses and write to your Drive.
              </div>

              {authLoading || urlLoading ? (
                <Skeleton className="h-12 w-full rounded-lg" />
              ) : (
                <Button size="lg" className="w-full text-base font-semibold h-12 shadow-md hover:shadow-lg transition-all" onClick={handleConnect} disabled={!authUrl?.url}>
                  Connect with Google
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="w-full max-w-5xl mt-12 pt-6 border-t border-muted/30 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Classroom Exporter</span>
        <span className="hidden sm:inline">·</span>
        <a href="/privacy.html" className="hover:text-foreground transition-colors underline-offset-4 hover:underline">Privacy Policy</a>
        <span className="hidden sm:inline">·</span>
        <a href="/terms.html" className="hover:text-foreground transition-colors underline-offset-4 hover:underline">Terms of Service</a>
      </footer>
    </div>
  );
}
