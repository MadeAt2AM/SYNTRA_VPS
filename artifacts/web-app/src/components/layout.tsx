import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  CalendarDays, 
  Users, 
  Clock, 
  MapPin, 
  Mail, 
  Settings, 
  LogOut,
  BarChart4,
  Briefcase
} from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user && location !== "/login" && location !== "/register") {
      setLocation("/login");
    }
  }, [user, isLoading, location, setLocation]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // Allow unauthenticated users on login/register pages (no layout shell)
  if (!user) {
    return <>{children}</>;
  }

  const role = user.role;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <div className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shadow-2xl border-r border-sidebar-border relative z-10">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded flex items-center justify-center text-sidebar-primary-foreground font-bold">
            SW
          </div>
          <span className="font-bold text-xl tracking-tight">ShiftWise</span>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1">
          {role === 'platform_admin' ? (
            <>
              <NavItem href="/platform" icon={<BarChart4 size={18} />} label="Platform Dashboard" />
            </>
          ) : (
            <>
              <NavItem href="/dashboard" icon={<BarChart4 size={18} />} label="Dashboard" />
              <NavItem href="/schedule" icon={<CalendarDays size={18} />} label="Schedule" />
              {(role === 'admin' || role === 'manager') && (
                <NavItem href="/team" icon={<Users size={18} />} label="Team" />
              )}
              <NavItem href="/leave" icon={<Briefcase size={18} />} label="Leave Requests" />
              <NavItem href="/time-logs" icon={<Clock size={18} />} label="Time Logs" />
              {(role === 'admin' || role === 'manager') && (
                <>
                  <Separator className="my-4 opacity-20" />
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-2">Management</div>
                  <NavItem href="/workplaces" icon={<MapPin size={18} />} label="Workplaces" />
                  <NavItem href="/invitations" icon={<Mail size={18} />} label="Invitations" />
                </>
              )}
            </>
          )}
        </nav>

        <div className="p-4 mt-auto">
          <div className="bg-sidebar-accent p-4 rounded-lg mb-4">
            <div className="font-semibold truncate">{user.name}</div>
            <div className="text-sm text-sidebar-foreground/70 truncate">{user.email}</div>
            <div className="text-xs uppercase tracking-wider mt-2 font-mono text-sidebar-primary">
              {role.replace('_', ' ')}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Link href="/settings" className="flex-1">
              <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
                <Settings size={18} className="mr-2" /> Settings
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={logout} className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive">
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-8 relative">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const [location] = useLocation();
  const isActive = location === href || (location.startsWith(href) && href !== '/');
  
  return (
    <Link href={href} className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all font-medium ${isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
