import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

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
        <Layout><CoursesPage /></Layout>
      </Route>
      <Route path="/export">
        <Layout><ExportSetupPage /></Layout>
      </Route>
      <Route path="/exports">
        <Layout><ExportsHistoryPage /></Layout>
      </Route>
      <Route path="/exports/:id">
        <Layout><ExportDetailPage /></Layout>
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
