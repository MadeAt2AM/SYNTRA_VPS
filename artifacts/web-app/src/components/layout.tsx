import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notification-bell";
import {
  CalendarDays,
  Users,
  Clock,
  MapPin,
  Mail,
  Settings,
  LogOut,
  BarChart4,
  Briefcase,
  Menu,
  CalendarCheck,
  X,
} from "lucide-react";

const PUBLIC_PATHS = ["/", "/login", "/register", "/change-password", "/forgot-password", "/reset-password"];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground font-mono">Loading SYNTRA...</span>
        </div>
      </div>
    );
  }

  // Public pages get no sidebar
  if (!user || PUBLIC_PATHS.includes(location)) {
    return <>{children}</>;
  }

  const role = user.role;

  const navContent = (onNavClick?: () => void) => (
    <>
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-9 h-9 bg-sidebar-primary rounded-lg flex items-center justify-center text-sidebar-primary-foreground font-bold text-sm shadow">
          SY
        </div>
        <div>
          <div className="font-bold text-base tracking-tight leading-none">SYNTRA</div>
          <div className="text-[10px] text-sidebar-foreground/50 font-mono uppercase tracking-widest leading-tight mt-0.5">Workforce Mgmt</div>
        </div>
        <div className="ml-auto flex items-center gap-1 text-sidebar-foreground [&_button:hover]:bg-sidebar-accent [&_button:hover]:text-sidebar-foreground [&_button]:text-sidebar-foreground">
          <NotificationBell />
          {onNavClick && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground" onClick={onNavClick}>
              <X size={16} />
            </Button>
          )}
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        {role === 'platform_admin' ? (
          <NavItem href="/platform" icon={<BarChart4 size={17} />} label="Platform Dashboard" onClick={onNavClick} />
        ) : (
          <>
            <NavItem href="/dashboard" icon={<BarChart4 size={17} />} label="Dashboard" onClick={onNavClick} />
            <NavItem href="/schedule" icon={<CalendarDays size={17} />} label="Schedule" onClick={onNavClick} />
            <NavItem href="/availability" icon={<CalendarCheck size={17} />} label="My Availability" onClick={onNavClick} />
            {(role === 'admin' || role === 'manager') && (
              <NavItem href="/team" icon={<Users size={17} />} label="Team" onClick={onNavClick} />
            )}
            <NavItem href="/leave" icon={<Briefcase size={17} />} label="Leave" onClick={onNavClick} />
            <NavItem href="/time-logs" icon={<Clock size={17} />} label="Time Logs" onClick={onNavClick} />
            {(role === 'admin' || role === 'manager') && (
              <>
                <Separator className="my-3 opacity-20" />
                <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 mb-1.5 px-3 font-mono">Management</div>
                <NavItem href="/workplaces" icon={<MapPin size={17} />} label="Workplaces" onClick={onNavClick} />
                <NavItem href="/invitations" icon={<Mail size={17} />} label="Invitations" onClick={onNavClick} />
              </>
            )}
          </>
        )}
      </nav>

      <div className="p-3 mt-auto border-t border-sidebar-border">
        <div className="bg-sidebar-accent rounded-lg p-3 mb-3">
          <div className="font-semibold text-sm truncate">{user.name}</div>
          <div className="text-xs text-sidebar-foreground/60 truncate mt-0.5">{user.email}</div>
          <div className="text-[10px] uppercase tracking-widest mt-1.5 font-mono text-sidebar-primary">
            {role.replace('_', ' ')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="flex-1" onClick={onNavClick}>
            <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground h-8">
              <Settings size={15} className="mr-2" /> Settings
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={logout} className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive flex-shrink-0">
            <LogOut size={15} />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-60 bg-sidebar text-sidebar-foreground flex-col shadow-2xl border-r border-sidebar-border z-10 flex-shrink-0 h-screen sticky top-0 overflow-hidden">
        {navContent()}
      </div>

      {/* Mobile Header + Sheet */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-sidebar-primary rounded flex items-center justify-center text-sidebar-primary-foreground font-bold text-xs">SY</div>
            <span className="font-bold text-base tracking-tight">SYNTRA</span>
          </div>
          <div className="flex items-center gap-1 text-sidebar-foreground [&_button:hover]:bg-sidebar-accent [&_button:hover]:text-sidebar-foreground [&_button]:text-sidebar-foreground">
            <NotificationBell />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground">
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" showClose={false} className="p-0 w-64 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col">
                {navContent(() => setMobileOpen(false))}
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItem({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = location === href || (location.startsWith(href) && href !== '/');

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md transition-all font-medium text-sm ${isActive
        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
        : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
