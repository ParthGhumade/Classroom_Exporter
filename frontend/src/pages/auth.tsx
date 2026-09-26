import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { SiGoogleclassroom, SiGoogledrive } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Lock, Folders, Zap, Key } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { authenticated, login, isLoading, setManualToken } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [devModalOpen, setDevModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  if (authenticated) {
    setLocation("/courses");
    return null;
  }

  const handleConnect = async () => {
    setErrorMsg(null);
    try {
      await login();
      setLocation("/courses");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to authenticate with Google");
      if (err.message?.includes("VITE_GOOGLE_CLIENT_ID")) {
        setDevModalOpen(true);
      }
    }
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    try {
      await setManualToken(tokenInput.trim());
      setDevModalOpen(false);
      setLocation("/courses");
    } catch (err: any) {
      setErrorMsg(err.message || "Invalid token");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-2 sm:py-8">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center flex-1">
        {/* Info Column */}
        <div className="lg:col-span-7 space-y-6 sm:space-y-8 order-2 lg:order-1">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full mb-4 text-primary text-xs sm:text-sm font-medium">
              <SiGoogleclassroom className="w-4 h-4" />
              <span>Google Classroom & Drive Archiver</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-3 text-foreground leading-tight">
              Archive your classroom with precision.
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
              Classroom Exporter connects directly to your Google Account to back up all course materials, Drive files, and assignments directly into an organized Google Drive folder or as a single ZIP download.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-1">
            <div className="flex sm:flex-col items-start gap-3 p-3.5 rounded-xl bg-card border border-border/60 shadow-2xs">
              <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                <Folders className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm sm:text-base">Full Backup</h3>
                <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 leading-snug">
                  All files, coursework, and announcements.
                </p>
              </div>
            </div>

            <div className="flex sm:flex-col items-start gap-3 p-3.5 rounded-xl bg-card border border-border/60 shadow-2xs">
              <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm sm:text-base">Organized</h3>
                <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 leading-snug">
                  Grouped by topic, converts Docs to Office files.
                </p>
              </div>
            </div>

            <div className="flex sm:flex-col items-start gap-3 p-3.5 rounded-xl bg-card border border-border/60 shadow-2xs">
              <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm sm:text-base">Flexible Export</h3>
                <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 leading-snug">
                  Save as a ZIP file or export to Google Drive.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action / Connect Card Column */}
        <div className="lg:col-span-5 flex justify-center order-1 lg:order-2 w-full">
          <Card className="w-full max-w-md shadow-lg border-border/80 bg-card/90 backdrop-blur-sm">
            <CardHeader className="text-center pb-2 pt-6 sm:pt-8 px-5 sm:px-6">
              <CardTitle className="text-xl sm:text-2xl font-bold">Connect Account</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Authorize access to start exporting</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-4 pb-6 px-5 sm:px-6">
              <div className="flex justify-center items-center gap-4 sm:gap-6 text-muted-foreground">
                <div className="p-3 sm:p-4 bg-muted/60 rounded-2xl border border-border/50">
                  <SiGoogleclassroom className="w-7 h-7 sm:w-9 sm:h-9 text-[#008375]" />
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                <div className="p-3 sm:p-4 bg-muted/60 rounded-2xl border border-border/50">
                  <SiGoogledrive className="w-7 h-7 sm:w-9 sm:h-9 text-[#1FA463]" />
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs sm:text-sm p-3 leading-relaxed">
                  <div className="font-semibold mb-0.5">Authorization Error</div>
                  <div>{errorMsg}</div>
                </div>
              )}

              <div className="bg-primary/5 border border-primary/10 p-3 sm:p-3.5 rounded-xl text-xs sm:text-sm text-center text-muted-foreground leading-relaxed">
                Connect your Google Account to view your enrolled courses and export files directly into Drive or a ZIP archive.
              </div>

              {isLoading ? (
                <Skeleton className="h-11 w-full rounded-xl" />
              ) : (
                <div className="space-y-2.5">
                  <Button
                    size="lg"
                    className="w-full text-sm sm:text-base font-semibold h-11 sm:h-12 shadow-sm active:scale-[0.98] transition-all touch-manipulation cursor-pointer"
                    onClick={handleConnect}
                  >
                    Connect with Google
                  </Button>

                  <p className="text-[11px] sm:text-xs text-center text-muted-foreground pt-1 leading-relaxed">
                    By connecting, you agree to our{" "}
                    <a
                      href="/terms.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground font-medium"
                    >
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground font-medium"
                    >
                      Privacy Policy
                    </a>.
                  </p>

                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => setDevModalOpen(true)}
                      className="text-[11px] sm:text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 py-1 px-2 rounded hover:underline cursor-pointer"
                    >
                      <Key className="w-3 h-3" />
                      <span>Use Developer Access Token</span>
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Developer manual token dialog */}
      <Dialog open={devModalOpen} onOpenChange={setDevModalOpen}>
        <DialogContent className="w-[92vw] max-w-md rounded-2xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Developer Access Token</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
              Enter a temporary Google OAuth 2.0 access token with Classroom and Drive scopes to test without configuring OAuth Client ID.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleManualTokenSubmit} className="space-y-4 pt-2">
            <Input
              placeholder="ya29.a0..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="font-mono text-xs h-10"
            />
            <Button
              type="submit"
              className="w-full h-10 text-sm font-medium"
              disabled={!tokenInput.trim()}
            >
              Authenticate with Token
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
