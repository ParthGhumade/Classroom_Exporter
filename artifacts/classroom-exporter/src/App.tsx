import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useGetAuthStatus } from "@workspace/api-client-react";
import { useLocation } from "wouter";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useGetAuthStatus();
  const [, setLocation] = useLocation();

  if (isLoading) return null;
  if (!data?.authenticated) {
    setLocation("/");
    return null;
  }
  return <>{children}</>;
}

import Layout from "@/components/layout";
import AuthPage from "@/pages/auth";
import CoursesPage from "@/pages/courses";
import ExportSetupPage from "@/pages/export-setup";
import ExportsHistoryPage from "@/pages/exports-history";
import ExportDetailPage from "@/pages/export-detail";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthPage} />
      
      <Route path="/courses">
        <AuthGuard><Layout><CoursesPage /></Layout></AuthGuard>
      </Route>
      <Route path="/export">
        <AuthGuard><Layout><ExportSetupPage /></Layout></AuthGuard>
      </Route>
      <Route path="/exports">
        <AuthGuard><Layout><ExportsHistoryPage /></Layout></AuthGuard>
      </Route>
      <Route path="/exports/:id">
        <AuthGuard><Layout><ExportDetailPage /></Layout></AuthGuard>
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
