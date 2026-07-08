import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  useListLeaveRequests,
  useListTimeLogs,
  useListUsers,
  getListLeaveRequestsQueryKey,
  getListTimeLogsQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Briefcase, Clock, ChevronRight } from "lucide-react";
import { format } from "date-fns";

// Poll periodically so the badge clears itself shortly after another manager
// (or this one, from another tab) resolves the pending item — no manual
// refresh required.
const POLL_MS = 20_000;

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const isManager = user?.role === "admin" || user?.role === "manager";

  const { data: leaveRequests = [] } = useListLeaveRequests({
    query: {
      enabled: !!user?.companyId && isManager,
      queryKey: getListLeaveRequestsQueryKey(),
      refetchInterval: POLL_MS,
    },
  });
  const { data: timeLogs = [] } = useListTimeLogs({
    query: {
      enabled: !!user?.companyId && isManager,
      queryKey: getListTimeLogsQueryKey(),
      refetchInterval: POLL_MS,
    },
  });
  const { data: users = [] } = useListUsers({
    query: {
      enabled: !!user?.companyId && isManager,
      queryKey: getListUsersQueryKey(),
      refetchInterval: POLL_MS,
    },
  });

  const pendingLeave = useMemo(
    () => leaveRequests.filter(l => l.status === "pending"),
    [leaveRequests],
  );
  // Same definition of "needs review" used on the Time Logs page: completed,
  // not location-verified, not yet manually validated by a manager.
  const pendingTimeLogs = useMemo(
    () => timeLogs.filter(t => !t.locationValid && !t.managerValidated && !!t.actualOut),
    [timeLogs],
  );

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const totalCount = pendingLeave.length + pendingTimeLogs.length;

  if (!isManager) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications">
          <Bell className="h-[18px] w-[18px]" />
          {totalCount > 0 && (
            <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border/50 bg-muted/30 flex items-center justify-between">
          <p className="text-sm font-semibold">Notifications</p>
          <span className="text-[11px] font-mono text-muted-foreground">
            {totalCount === 0 ? "All caught up" : `${totalCount} pending`}
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
          {totalCount === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">
              Nothing needs your attention right now.
            </p>
          )}
          {pendingLeave.map(lr => {
            const emp = userMap.get(lr.employeeId);
            return (
              <Link
                key={`leave-${lr.id}`}
                href="/leave"
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Briefcase className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {emp?.name ?? `Employee #${lr.employeeId}`} requested {lr.type} leave
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {format(new Date(lr.startDate), "MMM d")} – {format(new Date(lr.endDate), "MMM d")}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 mt-1" />
              </Link>
            );
          })}
          {pendingTimeLogs.map(log => {
            const emp = userMap.get(log.employeeId);
            return (
              <Link
                key={`log-${log.id}`}
                href="/time-logs"
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {emp?.name ?? `Employee #${log.employeeId}`}'s clock-in needs validation
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {format(new Date(log.actualIn), "MMM d, h:mm a")}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 mt-1" />
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
