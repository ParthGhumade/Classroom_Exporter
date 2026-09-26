import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { SiGoogleclassroom } from "react-icons/si";
import { LogOut, Archive, FolderSymlink, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { authenticated, user, logout, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return "U";
  };

  const isCoursesActive = location === "/courses" || location.startsWith("/export");
  const isExportsActive = location === "/exports" || location.startsWith("/exports/");

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      {/* Top Header */}
      <header className="border-b bg-card/95 backdrop-blur-md sticky top-0 z-40 shadow-xs transition-all">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] h-14 sm:h-16 flex items-center justify-between gap-2">
          <Link
            href="/"
            className="flex items-center gap-2 text-primary font-medium group active:scale-[0.98] transition-transform"
          >
            <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
              <SiGoogleclassroom className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <span className="font-bold tracking-tight text-base sm:text-lg text-foreground">
              Classroom Exporter
            </span>
          </Link>

          {isLoading ? (
            <Skeleton className="h-8 sm:h-9 w-24 sm:w-32 rounded-lg" />
          ) : authenticated ? (
            <div className="flex items-center gap-3 sm:gap-6">
              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center gap-6">
                <Link
                  href="/courses"
                  className={cn(
                    "text-sm font-medium transition-colors flex items-center gap-2 py-1 px-2.5 rounded-md",
                    isCoursesActive
                      ? "text-primary bg-primary/10 font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <FolderSymlink className="w-4 h-4" />
                  Courses
                </Link>
                <Link
                  href="/exports"
                  className={cn(
                    "text-sm font-medium transition-colors flex items-center gap-2 py-1 px-2.5 rounded-md",
                    isExportsActive
                      ? "text-primary bg-primary/10 font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Archive className="w-4 h-4" />
                  Exports
                </Link>
              </nav>

              <div className="flex items-center gap-2 sm:gap-3 md:border-l md:pl-5">
                <Avatar className="w-7 h-7 sm:w-8 sm:h-8 border border-border shadow-xs">
                  {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name || "User"} />}
                  <AvatarFallback className="text-[11px] sm:text-xs font-semibold bg-primary/10 text-primary">
                    {getInitials(user?.name, user?.email)}
                  </AvatarFallback>
                </Avatar>

                <div className="text-sm hidden sm:block text-right leading-tight max-w-[140px] md:max-w-[200px] truncate">
                  <div className="font-medium truncate">{user?.name || "Google User"}</div>
                  <div className="text-muted-foreground text-[11px] truncate">{user?.email || ""}</div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  title="Log out"
                  className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="sr-only">Log out</span>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 container mx-auto px-5 sm:px-8 md:px-10 lg:px-12 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] py-5 sm:py-8 max-w-6xl pb-8 md:pb-12">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      {authenticated && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border shadow-lg px-6 sm:px-8 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] flex items-center justify-around"
        >
          <Link
            href="/courses"
            className={cn(
              "flex flex-col items-center gap-1 py-1 px-4 rounded-xl text-xs font-medium transition-all active:scale-95 touch-manipulation",
              isCoursesActive
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className={cn("p-1 rounded-lg", isCoursesActive && "bg-primary/15")}>
              <FolderSymlink className="w-5 h-5" />
            </div>
            <span>Courses</span>
          </Link>

          <Link
            href="/exports"
            className={cn(
              "flex flex-col items-center gap-1 py-1 px-4 rounded-xl text-xs font-medium transition-all active:scale-95 touch-manipulation",
              isExportsActive
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className={cn("p-1 rounded-lg", isExportsActive && "bg-primary/15")}>
              <Archive className="w-5 h-5" />
            </div>
            <span>Exports</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="flex flex-col items-center gap-1 py-1 px-4 rounded-xl text-xs font-medium text-muted-foreground hover:text-destructive active:scale-95 transition-all touch-manipulation cursor-pointer"
          >
            <div className="p-1 rounded-lg">
              <LogOut className="w-5 h-5" />
            </div>
            <span>Log out</span>
          </button>
        </nav>
      )}

      {/* Footer */}
      <footer
        className={cn(
          "border-t bg-card/40 mt-auto",
          authenticated ? "pb-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] md:pb-4" : "pb-4"
        )}
      >
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground text-center">
          <span>© {new Date().getFullYear()} Classroom Exporter</span>
          <span className="hidden sm:inline">·</span>
          <div className="flex items-center gap-3">
            <a
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              Privacy Policy
            </a>
            <span>·</span>
            <a
              href="/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
