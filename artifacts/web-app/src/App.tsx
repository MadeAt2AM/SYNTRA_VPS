import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect, useLocation } from 'wouter';
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";

// Pages
import IndexPage from "@/pages/index";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import DashboardPage from "@/pages/dashboard";
import PlatformPage from "@/pages/platform";
import SchedulePage from "@/pages/schedule";
import TeamPage from "@/pages/team";
import LeavePage from "@/pages/leave";
import TimeLogsPage from "@/pages/time-logs";
import WorkplacesPage from "@/pages/workplaces";
import InvitationsPage from "@/pages/invitations";
import SettingsPage from "@/pages/settings";

const queryClient = new QueryClient();

// Configure the generated hooks to use our auth token
setAuthTokenGetter(() => localStorage.getItem("auth_token"));

// Route-level guard: requires authentication. Redirects to /login if not authed.
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to={`/login?from=${encodeURIComponent(location)}`} />;
  }

  return <>{children}</>;
}

// Route-level guard: requires specific role(s). Redirects to /dashboard if wrong role.
function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !roles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}

// Guest-only: redirect authenticated users away from login/register
function GuestOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    const dest = user.role === 'platform_admin' ? '/platform' : '/dashboard';
    return <Redirect to={dest} />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Layout>
      <Switch>
        {/* Public routes */}
        <Route path="/" component={IndexPage} />
        <Route path="/login">
          <GuestOnly><LoginPage /></GuestOnly>
        </Route>
        <Route path="/register">
          <GuestOnly><RegisterPage /></GuestOnly>
        </Route>

        {/* platform_admin only */}
        <Route path="/platform">
          <RequireAuth>
            <RequireRole roles={['platform_admin']}>
              <PlatformPage />
            </RequireRole>
          </RequireAuth>
        </Route>

        {/* All authenticated users — role-aware rendering happens inside the page */}
        <Route path="/dashboard">
          <RequireAuth>
            <RequireRole roles={['admin', 'manager', 'employee']}>
              <DashboardPage />
            </RequireRole>
          </RequireAuth>
        </Route>

        <Route path="/schedule">
          <RequireAuth>
            <RequireRole roles={['admin', 'manager', 'employee']}>
              <SchedulePage />
            </RequireRole>
          </RequireAuth>
        </Route>

        {/* admin + manager only */}
        <Route path="/team">
          <RequireAuth>
            <RequireRole roles={['admin', 'manager']}>
              <TeamPage />
            </RequireRole>
          </RequireAuth>
        </Route>

        <Route path="/workplaces">
          <RequireAuth>
            <RequireRole roles={['admin', 'manager']}>
              <WorkplacesPage />
            </RequireRole>
          </RequireAuth>
        </Route>

        <Route path="/invitations">
          <RequireAuth>
            <RequireRole roles={['admin', 'manager']}>
              <InvitationsPage />
            </RequireRole>
          </RequireAuth>
        </Route>

        {/* All authenticated company users */}
        <Route path="/leave">
          <RequireAuth>
            <RequireRole roles={['admin', 'manager', 'employee']}>
              <LeavePage />
            </RequireRole>
          </RequireAuth>
        </Route>

        <Route path="/time-logs">
          <RequireAuth>
            <RequireRole roles={['admin', 'manager', 'employee']}>
              <TimeLogsPage />
            </RequireRole>
          </RequireAuth>
        </Route>

        <Route path="/settings">
          <RequireAuth>
            <RequireRole roles={['platform_admin', 'admin', 'manager', 'employee']}>
              <SettingsPage />
            </RequireRole>
          </RequireAuth>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
