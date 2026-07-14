import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect, useLocation } from 'wouter';
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";

import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import ChangePasswordPage from "@/pages/change-password";
import AcceptInvitePage from "@/pages/accept-invite";
import DashboardPage from "@/pages/dashboard";
import PlatformPage from "@/pages/platform";
import SchedulePage from "@/pages/schedule";
import TeamPage from "@/pages/team";
import LeavePage from "@/pages/leave";
import TimeLogsPage from "@/pages/time-logs";
import WorkplacesPage from "@/pages/workplaces";
import InvitationsPage from "@/pages/invitations";
import SettingsPage from "@/pages/settings";
import LegalPage from "@/pages/legal";
import AvailabilityPage from "@/pages/availability";

const queryClient = new QueryClient();

setAuthTokenGetter(() => localStorage.getItem("auth_token"));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
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

  // Force password change on first login
  if (user?.mustChangePassword && location !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  return <>{children}</>;
}

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
    if (user.mustChangePassword) return <Redirect to="/change-password" />;
    const dest = user.role === 'platform_admin' ? '/platform' : '/dashboard';
    return <Redirect to={dest} />;
  }

  return <>{children}</>;
}

function RootRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (isAuthenticated && user) {
    if (user.mustChangePassword) return <Redirect to="/change-password" />;
    return <Redirect to={user.role === 'platform_admin' ? '/platform' : '/dashboard'} />;
  }
  return <LandingPage />;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={RootRoute} />

        <Route path="/login">
          <GuestOnly><LoginPage /></GuestOnly>
        </Route>

        <Route path="/forgot-password">
          <GuestOnly><ForgotPasswordPage /></GuestOnly>
        </Route>

        <Route path="/reset-password">
          <GuestOnly><ResetPasswordPage /></GuestOnly>
        </Route>

        {/* Self-registration disabled; invitation-based onboarding via /accept-invite */}
        <Route path="/register">
          <Redirect to="/login" />
        </Route>

        <Route path="/accept-invite">
          <GuestOnly><AcceptInvitePage /></GuestOnly>
        </Route>

        <Route path="/change-password">
          <RequireAuth>
            <ChangePasswordPage />
          </RequireAuth>
        </Route>

        <Route path="/platform">
          <RequireAuth>
            <RequireRole roles={['platform_admin']}>
              <PlatformPage />
            </RequireRole>
          </RequireAuth>
        </Route>

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

        <Route path="/availability">
          <RequireAuth>
            <RequireRole roles={['admin', 'manager', 'employee']}>
              <AvailabilityPage />
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

        <Route path="/legal/terms"><LegalPage kind="terms" /></Route>
        <Route path="/legal/privacy"><LegalPage kind="privacy" /></Route>

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
