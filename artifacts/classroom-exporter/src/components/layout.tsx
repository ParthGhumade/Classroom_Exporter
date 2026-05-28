import { Link, useLocation } from "wouter";
import { useGetAuthStatus, useLogout } from "@workspace/api-client-react";
import { SiGoogleclassroom } from "react-icons/si";
import { LogOut, Archive, FolderSymlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: authStatus, isLoading } = useGetAuthStatus();
  const logoutMutation = useLogout();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => setLocation("/")
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-primary font-medium group">
            <div className="p-1.5 bg-primary/10 rounded-md group-hover:bg-primary/20 transition-colors">
              <SiGoogleclassroom className="w-5 h-5 text-primary" />
            </div>
            <span className="font-semibold tracking-tight text-lg">Classroom Exporter</span>
          </Link>

          {isLoading ? (
            <Skeleton className="h-9 w-32" />
          ) : authStatus?.authenticated ? (
            <div className="flex items-center gap-6">
              <nav className="hidden md:flex items-center gap-6">
                <Link href="/courses" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
                  <FolderSymlink className="w-4 h-4" />
                  Courses
                </Link>
                <Link href="/exports" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
                  <Archive className="w-4 h-4" />
                  Exports
                </Link>
              </nav>
              
              <div className="flex items-center gap-4 border-l pl-6">
                <div className="text-sm hidden sm:block text-right leading-tight">
                  <div className="font-medium">{authStatus.name}</div>
                  <div className="text-muted-foreground text-xs">{authStatus.email}</div>
                </div>
                <Button variant="outline" size="icon" onClick={handleLogout} title="Log out" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        {children}
      </main>
    </div>
  );
}
