import { useMemo, useState, useEffect, useCallback } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Briefcase, Clock, ChevronRight, ArrowLeftRight, Gift, CheckCheck, HandCoins, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListShiftsQueryKey } from "@workspace/api-client-react";
import { listNotifications, markAllNotificationsRead, markNotificationRead, takeShiftOffer, respondToReplacement, type AppNotification } from "@/lib/notifications-api";

const POLL_MS = 20_000;

const TYPE_ICON: Record<string, React.ReactNode> = {
  swap_request: <ArrowLeftRight className="h-3.5 w-3.5" />,
  swap_accepted: <ArrowLeftRight className="h-3.5 w-3.5" />,
  swap_rejected: <ArrowLeftRight className="h-3.5 w-3.5" />,
  shift_offered: <Gift className="h-3.5 w-3.5" />,
  shift_taken: <Gift className="h-3.5 w-3.5" />,
  shortage_warning: <Bell className="h-3.5 w-3.5" />,
  replacement_request: <UserCheck className="h-3.5 w-3.5" />,
  replacement_accepted: <UserCheck className="h-3.5 w-3.5" />,
  replacement_rejected: <UserCheck className="h-3.5 w-3.5" />,
};

const TYPE_COLOR: Record<string, string> = {
  swap_request: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  swap_accepted: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  swap_rejected: "bg-red-500/15 text-red-600 dark:text-red-400",
  shift_offered: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  shift_taken: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  shortage_warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  replacement_request: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  replacement_accepted: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  replacement_rejected: "bg-red-500/15 text-red-600 dark:text-red-400",
};

// Which /schedule panel a given notification type should deep-link to open
const TYPE_PANEL: Record<string, string> = {
  swap_request: "swaps",
  swap_accepted: "swaps",
  swap_rejected: "swaps",
  shift_offered: "offers",
  shift_taken: "offers",
  replacement_request: "replacements",
  replacement_accepted: "replacements",
  replacement_rejected: "replacements",
};

export function NotificationBell() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const isManager = user?.role === "admin" || user?.role === "manager";

  // Confirm-before-take for shift_offered notifications
  const [takeConfirm, setTakeConfirm] = useState<{ offerId: number; shiftStart?: string } | null>(null);
  const [taking, setTaking] = useState(false);
  const [respondingReplacementId, setRespondingReplacementId] = useState<number | null>(null);

  async function handleConfirmTake() {
    if (!takeConfirm) return;
    setTaking(true);
    try {
      await takeShiftOffer(takeConfirm.offerId);
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      toast({ title: "Shift taken — it's now on your schedule" });
      setTakeConfirm(null);
    } catch (err: any) {
      toast({ title: "Couldn't take shift", description: err?.data?.error ?? "It may have already been taken.", variant: "destructive" });
    } finally { setTaking(false); }
  }

  async function handleQuickReplacementRespond(replacementId: number, action: "accept" | "reject") {
    setRespondingReplacementId(replacementId);
    try {
      await respondToReplacement(replacementId, action);
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      toast({ title: action === "accept" ? "You're covering that shift now" : "Request declined" });
    } catch (err: any) {
      toast({ title: "Couldn't respond", description: err?.data?.error ?? "Please try again.", variant: "destructive" });
    } finally { setRespondingReplacementId(null); }
  }

  // App notifications (all roles)
  const [appNotifs, setAppNotifs] = useState<AppNotification[]>([]);
  const fetchNotifs = useCallback(async () => {
    if (!user?.companyId) return;
    try {
      const data = await listNotifications();
      setAppNotifs(data);
    } catch {}
  }, [user?.companyId]);

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  // Manager-only: leave requests + time logs
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
  const pendingTimeLogs = useMemo(
    () => timeLogs.filter(t => !t.locationValid && !t.managerValidated && !!t.actualOut),
    [timeLogs],
  );
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  const unreadAppNotifs = appNotifs.filter(n => !n.readAt);
  const totalCount = unreadAppNotifs.length + (isManager ? pendingLeave.length + pendingTimeLogs.length : 0);

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setAppNotifs(prev => prev.map(n => ({ ...n, readAt: new Date().toISOString() })));
  }

  async function handleMarkOneRead(id: number) {
    await markNotificationRead(id);
    setAppNotifs(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
  }

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (v) fetchNotifs(); }}>
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
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground">
              {totalCount === 0 ? "All caught up" : `${totalCount} new`}
            </span>
            {unreadAppNotifs.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={handleMarkAllRead}>
                <CheckCheck className="h-3 w-3" /> Mark all read
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-border/40">
          {totalCount === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">
              Nothing needs your attention right now.
            </p>
          )}

          {/* App notifications (swaps, offers, replacements, etc.) */}
          {unreadAppNotifs.map(n => {
            const isOffer = n.type === "shift_offered" && n.data?.offerId;
            const isReplacementRequest = n.type === "replacement_request" && n.data?.replacementId;
            const panel = TYPE_PANEL[n.type];
            const href = panel ? `/schedule?panel=${panel}` : "/schedule";
            return (
              <div key={`notif-${n.id}`} className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left">
                <Link
                  href={href}
                  onClick={() => { handleMarkOneRead(n.id); setOpen(false); }}
                  className="flex items-start gap-2.5 flex-1 min-w-0 text-left"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${TYPE_COLOR[n.type] ?? "bg-muted text-muted-foreground"}`}>
                    {TYPE_ICON[n.type] ?? <Bell className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">
                      {format(new Date(n.createdAt), "MMM d, h:mm a")}
                    </p>
                  </div>
                </Link>
                {isOffer && (
                  <Button
                    size="sm"
                    className="h-6 text-[11px] px-2 gap-1 flex-shrink-0 mt-0.5"
                    onClick={() => { setTakeConfirm({ offerId: n.data.offerId, shiftStart: n.data.shiftStart }); handleMarkOneRead(n.id); }}
                  >
                    <HandCoins className="h-3 w-3" /> Take
                  </Button>
                )}
                {isReplacementRequest && (
                  <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
                    <Button
                      size="sm"
                      className="h-6 text-[11px] px-2 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={respondingReplacementId === n.data.replacementId}
                      onClick={() => { handleQuickReplacementRespond(n.data.replacementId, "accept"); handleMarkOneRead(n.id); }}
                    >
                      ✓ Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] px-2 gap-1 text-red-500 hover:text-red-600"
                      disabled={respondingReplacementId === n.data.replacementId}
                      onClick={() => { handleQuickReplacementRespond(n.data.replacementId, "reject"); handleMarkOneRead(n.id); }}
                    >
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Manager: pending leave */}
          {isManager && pendingLeave.map(lr => {
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

          {/* Manager: pending time logs */}
          {isManager && pendingTimeLogs.map(log => {
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

      {/* Confirm before taking an offered shift */}
      <Dialog open={!!takeConfirm} onOpenChange={v => !v && setTakeConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HandCoins className="w-4 h-4 text-primary" />Take This Shift?</DialogTitle>
            <DialogDescription>This will assign the shift to you immediately. Make sure you're available{takeConfirm?.shiftStart ? ` on ${format(new Date(takeConfirm.shiftStart), "EEEE, MMM d 'at' h:mm a")}` : ""}.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setTakeConfirm(null)}>Cancel</Button>
            <Button size="sm" onClick={handleConfirmTake} disabled={taking} className="font-semibold gap-1.5">
              <HandCoins className="w-3.5 h-3.5" />{taking ? "Taking..." : "Yes, Take Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Popover>
  );
}
