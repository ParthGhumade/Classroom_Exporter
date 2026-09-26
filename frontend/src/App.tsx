import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";

import Layout from "@/components/layout";
import AuthPage from "@/pages/auth";
import CoursesPage from "@/pages/courses";
import ExportSetupPage from "@/pages/export-setup";
import ExportsHistoryPage from "@/pages/exports-history";
import ExportDetailPage from "@/pages/export-detail";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return null;
  if (!authenticated) {
    setLocation("/");
    return null;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Layout>
          <AuthPage />
        </Layout>
      </Route>

      <Route path="/courses">
        <AuthGuard>
          <Layout>
            <CoursesPage />
          </Layout>
        </AuthGuard>
      </Route>

      <Route path="/export">
        <AuthGuard>
          <Layout>
            <ExportSetupPage />
          </Layout>
        </AuthGuard>
      </Route>

      <Route path="/exports">
        <AuthGuard>
          <Layout>
            <ExportsHistoryPage />
          </Layout>
        </AuthGuard>
      </Route>

      <Route path="/exports/:id">
        <AuthGuard>
          <Layout>
            <ExportDetailPage />
          </Layout>
        </AuthGuard>
      </Route>

      <Route>
        <Layout>
          <NotFound />
        </Layout>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
