import { useAuth } from "@/hooks/use-auth";
import { useListUsers, useListLeaveRequests, useListTimeLogs, useListShifts, useGetCompany, getListUsersQueryKey, getListLeaveRequestsQueryKey, getListTimeLogsQueryKey, getListShiftsQueryKey, getGetCompanyQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, isToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Users, Clock, CalendarDays, AlertCircle, TrendingUp, DollarSign, Timer, BarChart3, ArrowLeftRight } from "lucide-react";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/currency";
import { listShiftSwaps, respondToSwap, type ShiftSwap } from "@/lib/notifications-api";

function computeStats(timeLogs: any[], userMap: Map<number, any>, from: Date, to: Date) {
  let totalHours = 0;
  let totalPay = 0;
  for (const log of timeLogs) {
    if (!log.actualOut || !log.actualIn) continue;
    const logIn = new Date(log.actualIn);
    if (logIn < from || logIn > to) continue;
    const logOut = new Date(log.actualOut);
    const hours = log.validatedHours
      ? parseFloat(log.validatedHours)
      : (logOut.getTime() - logIn.getTime()) / 3600000;
    if (isNaN(hours) || hours <= 0) continue;
    const emp = userMap.get(log.employeeId);
    const rate = parseFloat(emp?.hourlyRate ?? "0");
    totalHours += hours;
    totalPay += hours * rate;
  }
  return { hours: Math.round(totalHours * 10) / 10, pay: Math.round(totalPay * 100) / 100 };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: users = [] } = useListUsers({ query: { enabled: !!user && user.role !== 'employee', queryKey: getListUsersQueryKey() } });
  const { data: leaveRequests = [] } = useListLeaveRequests({ query: { enabled: !!user, queryKey: getListLeaveRequestsQueryKey() } });
  const { data: timeLogs = [] } = useListTimeLogs({ query: { enabled: !!user, queryKey: getListTimeLogsQueryKey() } });
  const { data: shifts = [] } = useListShifts({ query: { enabled: !!user, queryKey: getListShiftsQueryKey() } });
  const { data: company } = useGetCompany(user?.companyId || 0, { query: { enabled: !!user?.companyId, queryKey: getGetCompanyQueryKey(user?.companyId || 0) } });

  const role = user?.role;
  const isOwner = role === "admin";

  const todayShifts = shifts.filter(s => isToday(new Date(s.startTime)));
  const pendingLeave = leaveRequests.filter(l => l.status === 'pending');
  const activeTimeLogs = timeLogs.filter(t => !t.actualOut);

  const now = new Date();
  const weekFrom = startOfWeek(now, { weekStartsOn: 1 });
  const weekTo = endOfWeek(now, { weekStartsOn: 1 });
  const monthFrom = startOfMonth(now);
  const monthTo = endOfMonth(now);

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  const weekStats = useMemo(() => computeStats(timeLogs, userMap, weekFrom, weekTo), [timeLogs, userMap]);
  const monthStats = useMemo(() => computeStats(timeLogs, userMap, monthFrom, monthTo), [timeLogs, userMap]);

  function formatPay(val: number) {
    return formatMoney(val, (company as any)?.currency);
  }

  // Pending shift-swap requests waiting on me, surfaced right on the dashboard
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [respondingSwapId, setRespondingSwapId] = useState<number | null>(null);
  const loadSwaps = useCallback(async () => {
    if (!user) return;
    try { setSwaps(await listShiftSwaps()); } catch { /* ignore */ }
  }, [user]);
  useEffect(() => { loadSwaps(); }, [loadSwaps]);

  const pendingSwapsForMe = useMemo(
    () => swaps.filter(s => s.targetEmployeeId === user?.id && s.status === "pending"),
    [swaps, user],
  );
  const shiftMap = useMemo(() => new Map(shifts.map(s => [s.id, s])), [shifts]);

  async function handleRespondSwap(swapId: number, action: "accept" | "reject") {
    setRespondingSwapId(swapId);
    try {
      await respondToSwap(swapId, action);
      toast({ title: action === "accept" ? "Swap accepted" : "Swap declined" });
      await loadSwaps();
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.data?.error, variant: "destructive" });
    } finally { setRespondingSwapId(null); }
  }

  function fmtShiftTime(iso: string) {
    return format(new Date(iso), "h:mma").toLowerCase();
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold font-sans tracking-tight text-foreground">
            Welcome back, {user?.name.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">
            {format(now, 'EEEE, MMMM do, yyyy')}
          </p>
        </div>
      </div>

      {/* Core stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {(role === 'admin' || role === 'manager') && (
          <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Total Staff</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{users.length}</div>
              <p className="text-xs text-primary font-medium mt-1">
                {users.filter(u => u.status === 'active').length} active
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Today's Shifts</CardTitle>
            <CalendarDays className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayShifts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {role === 'employee' ? 'Assigned to you' : 'Across all locations'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Pending Leave</CardTitle>
            <AlertCircle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{role === 'employee' ? leaveRequests.filter(l => l.employeeId === user?.id && l.status === 'pending').length : pendingLeave.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {role === 'employee' ? 'Awaiting approval' : 'Needs your review'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Currently Clocked In</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{role === 'employee' ? (activeTimeLogs.some(t => t.employeeId === user?.id) ? '1' : '0') : activeTimeLogs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {role === 'employee' ? (activeTimeLogs.some(t => t.employeeId === user?.id) ? 'You are clocked in' : 'You are clocked out') : 'Staff currently working'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Owner analytics */}
      {isOwner && (
        <div>
          <h2 className="text-xl font-bold font-sans tracking-tight border-b border-border/50 pb-2 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Payroll Analytics
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur border-t-2 border-t-emerald-500/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">This Week — Hours</CardTitle>
                <Timer className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{weekStats.hours}<span className="text-lg font-normal text-muted-foreground ml-1">h</span></div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(weekFrom, 'MMM d')} – {format(weekTo, 'MMM d')}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur border-t-2 border-t-emerald-500/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">This Week — Pay</CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatPay(weekStats.pay)}</div>
                <p className="text-xs text-muted-foreground mt-1">Estimated staff cost</p>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur border-t-2 border-t-primary/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">This Month — Hours</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{monthStats.hours}<span className="text-lg font-normal text-muted-foreground ml-1">h</span></div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(monthFrom, 'MMM d')} – {format(monthTo, 'MMM d, yyyy')}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur border-t-2 border-t-primary/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">This Month — Pay</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatPay(monthStats.pay)}</div>
                <p className="text-xs text-muted-foreground mt-1">Estimated staff cost</p>
              </CardContent>
            </Card>
          </div>
          {weekStats.pay === 0 && monthStats.pay === 0 && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Analytics are calculated from clocked-in time logs with hourly rates set on staff profiles.
            </p>
          )}
        </div>
      )}

      {pendingSwapsForMe.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold font-sans tracking-tight border-b border-border/50 pb-2 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" /> Pending Swap Requests
          </h2>
          <div className="space-y-3">
            {pendingSwapsForMe.map(swap => {
              const requester = users.find(u => u.id === swap.requesterId) ?? userMap.get(swap.requesterId);
              const theirShift = shiftMap.get(swap.requesterShiftId);
              const myShift = shiftMap.get(swap.targetShiftId);
              const busy = respondingSwapId === swap.id;
              return (
                <div key={swap.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-card rounded-lg border border-border shadow-sm">
                  <div>
                    <p className="font-semibold text-sm">
                      {requester?.name ?? "A colleague"} wants to swap shifts with you
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Their shift: {theirShift ? `${format(new Date(theirShift.startTime), "MMM d, h:mm a")}` : "—"}
                      {"  •  "}Your shift: {myShift ? `${format(new Date(myShift.startTime), "MMM d, h:mm a")}` : "—"}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => handleRespondSwap(swap.id, "reject")}>Decline</Button>
                    <Button size="sm" disabled={busy} onClick={() => handleRespondSwap(swap.id, "accept")}>{busy ? "..." : "Accept"}</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-bold font-sans tracking-tight border-b border-border/50 pb-2">Today's Schedule</h2>
          {todayShifts.length === 0 ? (
            <div className="p-8 text-center bg-card/50 rounded-lg border border-dashed border-border/50">
              <p className="text-muted-foreground">No shifts scheduled for today.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayShifts.map(shift => {
                const employee = users.find(u => u.id === shift.employeeId);
                return (
                  <div key={shift.id} className="flex items-center justify-between p-4 bg-card rounded-lg border border-border shadow-sm transition-all">
                    <div>
                      <p className="font-semibold">{format(new Date(shift.startTime), 'h:mm a')} - {format(new Date(shift.endTime), 'h:mm a')}</p>
                      {role !== 'employee' && employee && (
                        <p className="text-sm text-muted-foreground">{employee.name} • {shift.role || 'Staff'}</p>
                      )}
                    </div>
                    <div className={`text-right text-xs font-mono px-3 py-1 rounded border ${shift.status === 'published' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400' : 'bg-background border-border/50 text-muted-foreground'}`}>
                      {shift.status}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold font-sans tracking-tight border-b border-border/50 pb-2">Recent Activity</h2>
          {timeLogs.slice(0, 5).length === 0 ? (
            <div className="p-8 text-center bg-card/50 rounded-lg border border-dashed border-border/50">
              <p className="text-muted-foreground">No recent activity.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {timeLogs.slice(0, 5).map(log => {
                const employee = users.find(u => u.id === log.employeeId);
                return (
                  <div key={log.id} className="flex items-center justify-between p-4 bg-card rounded-lg border border-border shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary"></div>
                      <div>
                        <p className="font-semibold text-sm">
                          {employee?.name || 'You'} {log.actualOut ? 'clocked out' : 'clocked in'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(log.actualOut || log.actualIn), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
