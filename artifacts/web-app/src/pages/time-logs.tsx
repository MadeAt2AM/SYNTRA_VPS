import { useAuth } from "@/hooks/use-auth";
import {
  useListTimeLogs, useClockIn, useClockOut, useListUsers, useListShifts,
  getListUsersQueryKey, getListTimeLogsQueryKey, getListShiftsQueryKey,
} from "@workspace/api-client-react";
import type { Shift } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { format, formatDistanceStrict } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Play, Square, Download, CheckCheck, ShieldCheck, ShieldOff, MapPin, UserCheck, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type GeoStatus = "idle" | "fetching" | "in-range" | "out-of-range" | "unavailable" | "no-workplace";

interface ClockInDialogState {
  open: boolean;
  selectedShiftId: number | null;
  geoStatus: GeoStatus;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  positionTimestamp: number | null;
  distanceMeters: number | null;
}

function fmtTime(iso: string) {
  const timePart = iso.includes("T") ? iso.split("T")[1] : iso;
  const [hStr, mStr] = timePart.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? "pm" : "am";
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2, "0")}${period}`;
}

function getTodayDateStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function isWithin10MinOfStart(shift: Shift): boolean {
  if (!shift.startTime) return false;
  const now = new Date();
  const start = new Date(shift.startTime);
  const diffMins = (now.getTime() - start.getTime()) / 60000;
  return diffMins >= -10 && diffMins <= 10;
}

export default function TimeLogsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [exportPeriod, setExportPeriod] = useState<"week" | "month">("month");
  const [exporting, setExporting] = useState(false);
  const [settling, setSettling] = useState(false);
  const [validatingId, setValidatingId] = useState<number | null>(null);

  const [clockInDialog, setClockInDialog] = useState<ClockInDialogState>({
    open: false,
    selectedShiftId: null,
    geoStatus: "idle",
    latitude: null,
    longitude: null,
    accuracy: null,
    positionTimestamp: null,
    distanceMeters: null,
  });

  const { data: logs = [], isLoading } = useListTimeLogs({ query: { enabled: !!user, queryKey: getListTimeLogsQueryKey() } });
  const { data: users = [] } = useListUsers({ query: { enabled: !!user && user.role !== 'employee', queryKey: getListUsersQueryKey() } });
  const { data: allShifts = [] } = useListShifts({ query: { enabled: !!user, queryKey: getListShiftsQueryKey() } });
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const activeLog = logs.find(l => l.employeeId === user?.id && !l.actualOut);
  const filteredLogs = user?.role === 'employee' ? logs.filter(l => l.employeeId === user.id) : logs;
  const isManager = user?.role === 'admin' || user?.role === 'manager';

  // Today's published shifts assigned to current employee
  const todayStr = getTodayDateStr();
  const myTodayShifts = allShifts.filter(s => {
    if (!s.startTime) return false;
    const dateStr = s.startTime.includes("T") ? s.startTime.split("T")[0] : s.startTime.slice(0, 10);
    const isToday = dateStr === todayStr;
    const isAssigned = s.employeeId === user?.id;
    const isPublished = s.status === "published";
    return isToday && isAssigned && isPublished;
  });

  // Request geolocation when dialog opens
  useEffect(() => {
    if (!clockInDialog.open) return;
    if (!navigator.geolocation) {
      setClockInDialog(d => ({ ...d, geoStatus: "unavailable" }));
      return;
    }
    setClockInDialog(d => ({ ...d, geoStatus: "fetching" }));
    navigator.geolocation.getCurrentPosition(
      pos => {
        setClockInDialog(d => ({
          ...d,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          positionTimestamp: pos.timestamp,
          geoStatus: "idle", // server will compute actual validation
        }));
      },
      () => {
        setClockInDialog(d => ({ ...d, geoStatus: "unavailable" }));
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, [clockInDialog.open]);

  function openClockInDialog() {
    setClockInDialog({
      open: true,
      selectedShiftId: myTodayShifts.length === 1 ? myTodayShifts[0].id : null,
      geoStatus: "idle",
      latitude: null,
      longitude: null,
      accuracy: null,
      positionTimestamp: null,
      distanceMeters: null,
    });
  }

  function handleClockInConfirm() {
    const selectedShift = myTodayShifts.find(s => s.id === clockInDialog.selectedShiftId);
    const autoStartTime = selectedShift && isWithin10MinOfStart(selectedShift);

    clockIn.mutate(
      {
        data: {
          shiftId: clockInDialog.selectedShiftId ?? undefined,
          latitude: clockInDialog.latitude ?? undefined,
          longitude: clockInDialog.longitude ?? undefined,
          accuracy: clockInDialog.accuracy ?? undefined,
          positionTimestamp: clockInDialog.positionTimestamp ?? undefined,
        } as any,
      },
      {
        onSuccess: () => {
          const msg = autoStartTime
            ? "Clocked in — payroll time set to shift start."
            : "Clocked in successfully.";
          toast({ title: "Clocked in", description: msg });
          queryClient.invalidateQueries({ queryKey: getListTimeLogsQueryKey() });
          setClockInDialog(d => ({ ...d, open: false }));
        },
        onError: (err: any) => {
          toast({ title: "Clock-in failed", description: err?.data?.error || "Please try again.", variant: "destructive" });
        },
      }
    );
  }

  const handleClockOut = () => {
    if (!activeLog) return;
    clockOut.mutate(
      { id: activeLog.id, data: { actualOut: new Date().toISOString() } as any },
      {
        onSuccess: () => {
          toast({ title: "Clocked out successfully" });
          queryClient.invalidateQueries({ queryKey: getListTimeLogsQueryKey() });
        },
      }
    );
  };

  async function handleToggleValidate(logId: number, currentlyValidated: boolean) {
    setValidatingId(logId);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/time-logs/${logId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ managerValidated: !currentlyValidated }),
      });
      if (!res.ok) throw new Error("Failed");
      queryClient.invalidateQueries({ queryKey: getListTimeLogsQueryKey() });
      toast({
        title: !currentlyValidated ? "Log validated" : "Validation removed",
        description: !currentlyValidated
          ? "This time log is now approved for payroll."
          : "Validation has been removed from this log.",
      });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setValidatingId(null);
    }
  }

  async function handleSettleAll() {
    setSettling(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/time-logs/settle-period`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ period: exportPeriod }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: getListTimeLogsQueryKey() });
      toast({
        title: `${data.settled} log${data.settled !== 1 ? "s" : ""} marked as paid`,
        description: `All unpaid ${exportPeriod === "week" ? "this week" : "this month"} are now settled.`,
      });
    } catch {
      toast({ title: "Settle failed", variant: "destructive" });
    } finally {
      setSettling(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/time-logs/export-csv?period=${exportPeriod}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="(.+)"/);
      a.download = match ? match[1] : `payroll-${exportPeriod}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded", description: `${exportPeriod === 'week' ? 'Weekly' : 'Monthly'} payroll CSV ready.` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  // Geo status display helpers
  function GeoStatusBadge() {
    const { geoStatus, latitude } = clockInDialog;
    if (geoStatus === "fetching") {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Getting your location...
        </div>
      );
    }
    if (geoStatus === "unavailable") {
      return (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          Location unavailable — clock-in will need manager review.
        </div>
      );
    }
    if (latitude !== null) {
      return (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="h-4 w-4" />
          Location acquired — server will verify against workplace radius.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold font-sans tracking-tight">Time Tracking</h1>
          <p className="text-muted-foreground mt-1 font-mono text-xs uppercase tracking-widest">Clock in and out</p>
        </div>
        {isManager && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={exportPeriod} onValueChange={(v: any) => setExportPeriod(v)}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" className="font-semibold gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20" onClick={handleSettleAll} disabled={settling}>
                <CheckCheck className="h-4 w-4" />
                {settling ? "Settling..." : "Settle All"}
              </Button>
            )}
            <Button variant="outline" size="sm" className="font-semibold gap-1.5" onClick={handleExport} disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        )}
      </div>

      {/* Clock in / out card */}
      <Card className="border-primary shadow-lg bg-card/80 backdrop-blur border-t-4">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-inner ${activeLog ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                <Clock size={28} />
              </div>
              <div>
                <h3 className="text-xl font-bold">{activeLog ? "Currently Clocked In" : "Not Clocked In"}</h3>
                {activeLog && (
                  <p className="text-muted-foreground font-mono text-sm mt-0.5">
                    Since {format(new Date(activeLog.actualIn), 'h:mm a')} ({formatDistanceStrict(new Date(activeLog.actualIn), new Date())} ago)
                  </p>
                )}
                {activeLog && !activeLog.locationValid && !activeLog.managerValidated && (
                  <p className="text-amber-600 dark:text-amber-400 text-xs mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Pending manager location review
                  </p>
                )}
              </div>
            </div>
            <div>
              {!activeLog ? (
                <Button size="lg" className="w-36 font-bold" onClick={openClockInDialog} disabled={clockIn.isPending}>
                  <Play className="mr-2 h-4 w-4" /> Clock In
                </Button>
              ) : (
                <Button size="lg" variant="destructive" className="w-36 font-bold" onClick={handleClockOut} disabled={clockOut.isPending}>
                  <Square className="mr-2 h-4 w-4" /> Clock Out
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation legend for managers */}
      {isManager && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="font-semibold uppercase tracking-widest mr-1">Validation:</span>
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-emerald-500" /> Location verified</span>
          <span className="flex items-center gap-1"><UserCheck className="h-3.5 w-3.5 text-blue-500" /> Manager approved</span>
          <span className="flex items-center gap-1 opacity-50"><ShieldOff className="h-3.5 w-3.5" /> Not validated</span>
          <span className="ml-auto text-[11px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 rounded px-2 py-0.5 font-mono">
            Payroll CSV includes pay only for validated logs
          </span>
        </div>
      )}

      <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">Recent Time Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  {user?.role !== 'employee' && <TableHead className="font-mono text-xs uppercase tracking-wider">Employee</TableHead>}
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Date</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Clock In</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Clock Out</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Duration</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Validation</TableHead>
                  {isManager && <TableHead className="font-mono text-xs uppercase tracking-wider">Paid</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No time logs found.</TableCell></TableRow>
                ) : (
                  filteredLogs.slice().reverse().map(log => {
                    const emp = users.find(u => u.id === log.employeeId);
                    const duration = log.actualOut ? formatDistanceStrict(new Date(log.actualIn), new Date(log.actualOut)) : '-';
                    const locValid = log.locationValid;
                    const mgrValid = log.managerValidated;
                    const isValidating = validatingId === log.id;
                    // Pending review = no location + no manager validation + completed log
                    const needsReview = !locValid && !mgrValid && !!log.actualOut;

                    return (
                      <TableRow key={log.id} className="hover:bg-muted/30">
                        {user?.role !== 'employee' && (
                          <TableCell className="font-medium text-sm">{emp?.name || `User #${log.employeeId}`}</TableCell>
                        )}
                        <TableCell className="text-sm">{format(new Date(log.actualIn), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="font-mono text-sm">{format(new Date(log.actualIn), 'h:mm a')}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.actualOut ? format(new Date(log.actualOut), 'h:mm a') : <span className="text-accent animate-pulse font-semibold">Active</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{duration}</TableCell>

                        {/* Validation column */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              {locValid && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                      <MapPin className="h-2.5 w-2.5" /> Loc
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>Location verified at clock-in</TooltipContent>
                                </Tooltip>
                              )}
                              {mgrValid && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                      <UserCheck className="h-2.5 w-2.5" /> Mgr
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>Manager approved</TooltipContent>
                                </Tooltip>
                              )}
                              {needsReview && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                      <AlertTriangle className="h-2.5 w-2.5" /> Review
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>Outside workplace radius — needs manager validation</TooltipContent>
                                </Tooltip>
                              )}
                              {!locValid && !mgrValid && !needsReview && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                                  None
                                </span>
                              )}
                            </div>

                            {/* Validate toggle — managers only, completed logs only */}
                            {isManager && log.actualOut && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-7 w-7 rounded-md transition-all",
                                      mgrValid
                                        ? "text-blue-500 hover:text-destructive hover:bg-destructive/10"
                                        : "text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10"
                                    )}
                                    disabled={isValidating}
                                    onClick={() => handleToggleValidate(log.id, !!mgrValid)}
                                  >
                                    {mgrValid
                                      ? <ShieldCheck className="h-4 w-4" />
                                      : <ShieldOff className="h-4 w-4" />
                                    }
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {mgrValid ? "Remove manager validation" : "Approve this log for payroll"}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>

                        {isManager && (
                          <TableCell>
                            <span className={`px-2 py-0.5 rounded text-xs font-mono ${log.paid ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                              {log.paid ? 'Paid' : 'Unpaid'}
                            </span>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Clock-in dialog */}
      <Dialog open={clockInDialog.open} onOpenChange={v => !v && setClockInDialog(d => ({ ...d, open: false }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-4 w-4 text-primary" />
              Clock In
            </DialogTitle>
            <DialogDescription>
              {format(new Date(), "EEEE, MMMM d · h:mm a")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Shift selection */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Shifts Today</p>
              {myTodayShifts.length === 0 ? (
                <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5 border border-border/40">
                  No published shifts assigned to you today. You can still clock in freely.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {myTodayShifts.map(shift => {
                    const isSelected = clockInDialog.selectedShiftId === shift.id;
                    const autoStart = isWithin10MinOfStart(shift);
                    return (
                      <button
                        key={shift.id}
                        onClick={() => setClockInDialog(d => ({ ...d, selectedShiftId: isSelected ? null : shift.id }))}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all",
                          isSelected
                            ? "bg-primary/10 border-primary/40 text-primary"
                            : "bg-card border-border/50 hover:border-primary/30 hover:bg-primary/5"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold">
                              {fmtTime(shift.startTime!)} – {fmtTime(shift.endTime!)}
                            </span>
                            {shift.role && (
                              <span className="ml-2 text-xs text-muted-foreground">{shift.role}</span>
                            )}
                          </div>
                          {isSelected && <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />}
                        </div>
                        {autoStart && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            Within 10 min of start — payroll will begin from shift start time
                          </p>
                        )}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setClockInDialog(d => ({ ...d, selectedShiftId: null }))}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg border text-sm transition-all text-muted-foreground",
                      clockInDialog.selectedShiftId === null
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "bg-card border-border/50 hover:border-primary/30"
                    )}
                  >
                    Clock in without selecting a shift
                  </button>
                </div>
              )}
            </div>

            {/* Location status */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</p>
              <div className="bg-muted/40 rounded-lg px-3 py-2.5 border border-border/40">
                <GeoStatusBadge />
                {clockInDialog.geoStatus === "idle" && clockInDialog.latitude === null && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    Requesting location...
                  </div>
                )}
              </div>
              {clockInDialog.geoStatus === "unavailable" && (
                <p className="text-xs text-muted-foreground">
                  If your workplace has a geofence set up, this log will be assigned to your manager for manual verification.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setClockInDialog(d => ({ ...d, open: false }))}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="font-semibold gap-1.5"
              onClick={handleClockInConfirm}
              disabled={clockIn.isPending || clockInDialog.geoStatus === "fetching"}
            >
              {clockIn.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Clocking in...</>
              ) : (
                <><Play className="h-3.5 w-3.5" /> Confirm Clock In</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
