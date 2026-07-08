import { useAuth } from "@/hooks/use-auth";
import {
  useListShifts, useListUsers, useListWorkplaces, useListLeaveRequests, useListAvailability,
  useCreateShift, useUpdateShift, useDeleteShift,
  useListShiftPresets, useCreateShiftPreset, useDeleteShiftPreset,
  getListShiftsQueryKey, getListUsersQueryKey, getListWorkplacesQueryKey,
  getListLeaveRequestsQueryKey, getListAvailabilityQueryKey, getListShiftPresetsQueryKey,
} from "@workspace/api-client-react";
import type { Shift, LeaveRequest } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfWeek, addDays, addWeeks, subWeeks, parseISO } from "date-fns";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Trash2, AlertTriangle, Ban, Send, RotateCcw, Clock, Settings2, X } from "lucide-react";
import { TimePicker } from "@/components/ui/time-picker";
import { apiCheckLeave } from "@/lib/platform-api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ShiftModal {
  open: boolean;
  mode: "create" | "edit";
  employeeId: number | null;
  date: string;
  shift?: Shift;
}

function getWeekDates(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
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

function getShiftStatusClass(status: string) {
  if (status === "published") return "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400";
  if (status === "cancelled") return "bg-red-500/10 border-red-400/30 text-red-500 line-through";
  return "bg-muted border-border/70 text-foreground";
}

export default function SchedulePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isManager = user?.role === "admin" || user?.role === "manager";

  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekDates = getWeekDates(weekStart);

  const [modal, setModal] = useState<ShiftModal>({ open: false, mode: "create", employeeId: null, date: "" });
  const [leaveWarning, setLeaveWarning] = useState<{ hasPending?: boolean; leaveType?: string } | null>(null);
  const [formValues, setFormValues] = useState({ startTime: "09:00", endTime: "17:00", workplaceId: "", role: "", notes: "" });
  const [publishing, setPublishing] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reverting, setReverting] = useState(false);

  // Preset management state
  const [showPresets, setShowPresets] = useState(false);
  const [newPreset, setNewPreset] = useState({ name: "", startTime: "09:00", endTime: "17:00" });
  const [savingPreset, setSavingPreset] = useState(false);

  const { data: shifts = [] } = useListShifts({ query: { enabled: !!user?.companyId, queryKey: getListShiftsQueryKey() } });
  const { data: users = [] } = useListUsers({ query: { enabled: !!user?.companyId, queryKey: getListUsersQueryKey() } });
  const { data: workplaces = [] } = useListWorkplaces({ query: { enabled: !!user?.companyId, queryKey: getListWorkplacesQueryKey() } });
  const { data: leaveRequests = [] } = useListLeaveRequests({ query: { enabled: !!user?.companyId, queryKey: getListLeaveRequestsQueryKey() } });
  const { data: availabilityList = [] } = useListAvailability({ query: { enabled: !!user?.companyId, queryKey: getListAvailabilityQueryKey() } });
  const { data: presets = [] } = useListShiftPresets({ query: { enabled: !!user?.companyId && isManager, queryKey: getListShiftPresetsQueryKey() } });

  const createShift = useCreateShift();
  const updateShift = useUpdateShift();
  const deleteShift = useDeleteShift();
  const createPreset = useCreateShiftPreset();
  const deletePreset = useDeleteShiftPreset();

  const employees = useMemo(
    () => users.filter(u => u.role !== "platform_admin" && (isManager ? true : u.id === user?.id)),
    [users, isManager, user]
  );

  const shiftsByEmpAndDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of shifts) {
      if (!shift.startTime) continue;
      const dateStr = shift.startTime.includes("T")
        ? shift.startTime.split("T")[0]
        : format(new Date(shift.startTime), "yyyy-MM-dd");
      const key = `${shift.employeeId ?? "unassigned"}:${dateStr}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(shift);
    }
    return map;
  }, [shifts]);

  const leaveByEmpAndDate = useMemo(() => {
    const map = new Map<string, LeaveRequest>();
    for (const lr of leaveRequests) {
      if (!lr.startDate || !lr.endDate) continue;
      let d = new Date(lr.startDate);
      const end = new Date(lr.endDate);
      while (d <= end) {
        const dateStr = format(d, "yyyy-MM-dd");
        const key = `${lr.employeeId}:${dateStr}`;
        if (!map.has(key)) map.set(key, lr);
        d = addDays(d, 1);
      }
    }
    return map;
  }, [leaveRequests]);

  const availByEmpAndDate = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const avail of availabilityList) {
      const slots = avail.slots as Record<string, boolean> | null;
      if (!slots) continue;
      for (const [dateStr, available] of Object.entries(slots)) {
        map.set(`${avail.employeeId}:${dateStr}`, available);
      }
    }
    return map;
  }, [availabilityList]);

  function openCreate(employeeId: number | null, dateStr: string) {
    setFormValues({ startTime: "09:00", endTime: "17:00", workplaceId: "", role: "", notes: "" });
    setLeaveWarning(null);
    setModal({ open: true, mode: "create", employeeId, date: dateStr });
    if (employeeId) {
      apiCheckLeave(employeeId, dateStr).then(res => {
        if (res.hasConflict) {
          toast({ title: "Cannot schedule", description: `Employee has approved ${res.leaveType} leave on this date.`, variant: "destructive" });
          setModal(m => ({ ...m, open: false }));
        } else if (res.hasPending) {
          setLeaveWarning({ hasPending: true, leaveType: res.leaveType });
        }
      });
    }
  }

  function openEdit(shift: Shift) {
    const dateStr = shift.startTime!.includes("T")
      ? shift.startTime!.split("T")[0]
      : format(new Date(shift.startTime!), "yyyy-MM-dd");
    const startTimePart = shift.startTime!.includes("T")
      ? shift.startTime!.split("T")[1].slice(0, 5)
      : format(new Date(shift.startTime!), "HH:mm");
    const endTimePart = shift.endTime
      ? shift.endTime.includes("T")
        ? shift.endTime.split("T")[1].slice(0, 5)
        : format(new Date(shift.endTime), "HH:mm")
      : "17:00";
    setFormValues({
      startTime: startTimePart,
      endTime: endTimePart,
      workplaceId: shift.workplaceId?.toString() || "",
      role: shift.role || "",
      notes: shift.notes || "",
    });
    setLeaveWarning(null);
    setModal({ open: true, mode: "edit", employeeId: shift.employeeId || null, date: dateStr, shift });
  }

  function applyPreset(startTime: string, endTime: string) {
    setFormValues(f => ({ ...f, startTime, endTime }));
  }

  async function handleSubmit() {
    if (!formValues.startTime || !formValues.endTime) return;
    const startISO = `${modal.date}T${formValues.startTime}:00`;
    const endISO = `${modal.date}T${formValues.endTime}:00`;
    const payload = {
      startTime: startISO,
      endTime: endISO,
      employeeId: modal.employeeId || null,
      workplaceId: formValues.workplaceId ? parseInt(formValues.workplaceId) : null,
      role: formValues.role || null,
      notes: formValues.notes || null,
    };
    if (modal.mode === "create") {
      createShift.mutate({ data: payload as any }, {
        onSuccess: () => {
          toast({ title: "Shift created" });
          qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
          setModal(m => ({ ...m, open: false }));
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error || "Failed to create shift", variant: "destructive" });
        }
      });
    } else if (modal.shift) {
      updateShift.mutate({ id: modal.shift.id, data: payload as any }, {
        onSuccess: () => {
          toast({ title: "Shift updated" });
          qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
          setModal(m => ({ ...m, open: false }));
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error || "Failed to update", variant: "destructive" });
        }
      });
    }
  }

  async function handleDelete() {
    if (!modal.shift) return;
    setDeleting(true);
    deleteShift.mutate({ id: modal.shift.id }, {
      onSuccess: () => {
        toast({ title: "Shift deleted" });
        qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
        setModal(m => ({ ...m, open: false }));
        setDeleting(false);
      }
    });
  }

  async function handleRevertToDraft() {
    if (!modal.shift) return;
    setReverting(true);
    updateShift.mutate({ id: modal.shift.id, data: { status: "draft" } as any }, {
      onSuccess: () => {
        toast({ title: "Shift reverted to draft" });
        qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
        setModal(m => ({ ...m, open: false }));
        setReverting(false);
      },
      onError: () => {
        toast({ title: "Failed to revert", variant: "destructive" });
        setReverting(false);
      }
    });
  }

  async function handlePublishSingle() {
    if (!modal.shift) return;
    setPublishingId(modal.shift.id);
    updateShift.mutate({ id: modal.shift.id, data: { status: "published" } as any }, {
      onSuccess: () => {
        toast({ title: "Shift published" });
        qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
        setModal(m => ({ ...m, open: false }));
        setPublishingId(null);
      },
      onError: () => {
        toast({ title: "Failed to publish", variant: "destructive" });
        setPublishingId(null);
      }
    });
  }

  async function publishAll() {
    const draftShifts = shifts.filter(s => s.status === "draft");
    if (!draftShifts.length) {
      toast({ title: "No drafts", description: "All shifts are already published." });
      return;
    }
    setPublishing(true);
    try {
      await Promise.all(draftShifts.map(s => updateShift.mutateAsync({ id: s.id, data: { status: "published" } as any })));
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      toast({ title: `${draftShifts.length} shift${draftShifts.length > 1 ? "s" : ""} published` });
    } catch {
      toast({ title: "Publish failed", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  }

  async function handleSavePreset() {
    if (!newPreset.name.trim()) return;
    setSavingPreset(true);
    createPreset.mutate(
      { data: { name: newPreset.name.trim(), startTime: newPreset.startTime, endTime: newPreset.endTime } },
      {
        onSuccess: () => {
          toast({ title: "Preset saved" });
          qc.invalidateQueries({ queryKey: getListShiftPresetsQueryKey() });
          setNewPreset({ name: "", startTime: "09:00", endTime: "17:00" });
          setSavingPreset(false);
        },
        onError: () => {
          toast({ title: "Failed to save preset", variant: "destructive" });
          setSavingPreset(false);
        }
      }
    );
  }

  function handleDeletePreset(id: number) {
    deletePreset.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListShiftPresetsQueryKey() });
        toast({ title: "Preset deleted" });
      }
    });
  }

  function getCellBg(empId: number, dateStr: string) {
    const leave = leaveByEmpAndDate.get(`${empId}:${dateStr}`);
    if (leave?.status === "approved") return "bg-red-500/10";
    if (leave?.status === "pending") return "bg-amber-500/10";
    if (availByEmpAndDate.get(`${empId}:${dateStr}`)) return "bg-emerald-500/8";
    return "";
  }

  const draftCount = shifts.filter(s => s.status === "draft").length;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-sans tracking-tight">Roster</h1>
          <p className="text-muted-foreground text-xs font-mono uppercase tracking-widest mt-0.5">
            Week of {format(weekStart, "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center bg-card border rounded-md shadow-sm">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none rounded-l-md" onClick={() => setWeekStart(w => subWeeks(w, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-3 text-xs font-mono rounded-none border-x" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none rounded-r-md" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {isManager && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-mono" onClick={() => setShowPresets(p => !p)}>
              <Settings2 className="h-3.5 w-3.5" />
              Presets
            </Button>
          )}
          {isManager && draftCount > 0 && (
            <Button size="sm" className="font-semibold gap-1.5" onClick={publishAll} disabled={publishing}>
              <Send className="h-3.5 w-3.5" />
              {publishing ? "Publishing..." : `Publish All ${draftCount} Draft${draftCount > 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      </div>

      {/* Preset Panel (managers only) */}
      {isManager && showPresets && (
        <div className="border border-border/60 rounded-xl bg-card/80 backdrop-blur shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Shift Presets</h3>
              <span className="text-xs text-muted-foreground font-mono">(click when adding a shift to auto-fill times)</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowPresets(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Existing presets */}
          <div className="flex flex-wrap gap-2">
            {presets.length === 0 && (
              <span className="text-xs text-muted-foreground italic">No presets yet. Add one below.</span>
            )}
            {presets.map(p => (
              <div key={p.id} className="flex items-center gap-1 px-2.5 py-1 bg-primary/8 border border-primary/20 rounded-full text-xs font-semibold group">
                <Clock className="h-3 w-3 text-primary/70" />
                <span>{p.name}</span>
                <span className="text-muted-foreground font-normal font-mono">{p.startTime}–{p.endTime}</span>
                <button
                  onClick={() => handleDeletePreset(p.id)}
                  className="ml-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Add new preset */}
          <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-border/40">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Name</Label>
              <Input
                placeholder="e.g. Morning, Afternoon"
                value={newPreset.name}
                onChange={e => setNewPreset(p => ({ ...p, name: e.target.value }))}
                className="h-8 text-sm w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Start</Label>
              <TimePicker value={newPreset.startTime} onChange={v => setNewPreset(p => ({ ...p, startTime: v }))} label="Start" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">End</Label>
              <TimePicker value={newPreset.endTime} onChange={v => setNewPreset(p => ({ ...p, endTime: v }))} label="End" />
            </div>
            <Button size="sm" onClick={handleSavePreset} disabled={savingPreset || !newPreset.name.trim()} className="h-8 gap-1.5 text-xs">
              <Plus className="h-3 w-3" />
              {savingPreset ? "Saving..." : "Save Preset"}
            </Button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {[
          { color: "bg-emerald-500/20 border border-emerald-500/30", label: "Available" },
          { color: "bg-amber-500/20 border border-amber-500/30", label: "Pending leave" },
          { color: "bg-red-500/20 border border-red-500/30", label: "Approved leave" },
          { color: "bg-emerald-500/20 border border-emerald-500/40", label: "Published" },
          { color: "bg-muted border border-border", label: "Draft" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded ${color}`} />
            {label}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="border border-border/50 rounded-xl overflow-hidden shadow-md bg-card">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse" style={{ minWidth: 700 }}>
            <thead>
              <tr className="bg-muted/50 border-b border-border/50">
                <th className="sticky left-0 z-10 bg-muted/80 backdrop-blur w-28 min-w-[110px] text-left px-3 py-3 text-xs uppercase tracking-wider font-mono text-muted-foreground border-r border-border/50">
                  Staff
                </th>
                {weekDates.map((d, i) => {
                  const isToday = format(new Date(), "yyyy-MM-dd") === format(d, "yyyy-MM-dd");
                  return (
                    <th key={i} className={`py-3 px-1 text-center text-xs uppercase tracking-wider font-mono border-r last:border-r-0 border-border/30 ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                      <div className="font-bold">{DAYS[i]}</div>
                      <div className={`text-base font-bold mt-0.5 ${isToday ? "text-primary" : "text-foreground"}`}>{format(d, "d")}</div>
                      <div className="text-[10px] opacity-60 font-normal">{format(d, "MMM")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {employees.map(emp => (
                <tr key={emp.id} className="group hover:bg-muted/10 transition-colors">
                  <td className="sticky left-0 z-10 bg-card border-r border-border/50 px-3 py-2 w-28 min-w-[110px]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-bold text-primary flex-shrink-0">
                        {emp.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs truncate">{emp.name.split(" ")[0]}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">{emp.role}</div>
                      </div>
                    </div>
                  </td>
                  {weekDates.map((d, i) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const cellShifts = shiftsByEmpAndDate.get(`${emp.id}:${dateStr}`) || [];
                    const leave = leaveByEmpAndDate.get(`${emp.id}:${dateStr}`);
                    const isApprovedLeave = leave?.status === "approved";
                    const isPendingLeave = leave?.status === "pending";
                    return (
                      <td key={i} className={`border-r last:border-r-0 border-border/30 align-top p-1 ${getCellBg(emp.id, dateStr)}`}>
                        <div className="flex flex-col gap-0.5 min-h-[64px]">
                          {isApprovedLeave && (
                            <div className="flex items-center gap-1 px-1 py-0.5 bg-red-500/15 text-red-600 dark:text-red-400 rounded text-[10px] font-semibold border border-red-400/30">
                              <Ban className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate capitalize">{leave!.type}</span>
                            </div>
                          )}
                          {isPendingLeave && !isApprovedLeave && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 px-1 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded text-[10px] font-semibold border border-amber-400/30 cursor-help">
                                  <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                                  <span className="truncate capitalize">{leave!.type}?</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Pending leave — {leave!.type}</TooltipContent>
                            </Tooltip>
                          )}
                          {cellShifts.map(shift => (
                            <button
                              key={shift.id}
                              onClick={() => isManager && openEdit(shift)}
                              className={`w-full text-left text-[11px] font-semibold px-1.5 py-1 rounded border leading-tight transition-all ${getShiftStatusClass(shift.status || "draft")} ${isManager ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                            >
                              <div className="truncate">{fmtTime(shift.startTime!)}–{fmtTime(shift.endTime!)}</div>
                              {shift.status === "draft" && <div className="text-[9px] font-normal opacity-60 uppercase tracking-widest">Draft</div>}
                            </button>
                          ))}
                          {isManager && !isApprovedLeave && (
                            <button
                              onClick={() => openCreate(emp.id, dateStr)}
                              className="flex items-center justify-center h-6 w-full opacity-0 group-hover:opacity-100 rounded border border-dashed border-border/50 text-muted-foreground hover:border-primary hover:text-primary transition-all text-xs mt-auto"
                              title="Add shift"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Unassigned row */}
              {isManager && (
                <tr className="group bg-muted/20 hover:bg-muted/30 transition-colors">
                  <td className="sticky left-0 z-10 bg-muted/40 border-r border-border/50 px-3 py-2">
                    <div className="text-[10px] font-semibold text-muted-foreground font-mono uppercase tracking-wider">Open Shifts</div>
                  </td>
                  {weekDates.map((d, i) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const unassigned = shiftsByEmpAndDate.get(`unassigned:${dateStr}`) || [];
                    return (
                      <td key={i} className="border-r last:border-r-0 border-border/30 align-top p-1">
                        <div className="flex flex-col gap-0.5 min-h-[48px]">
                          {unassigned.map(shift => (
                            <button key={shift.id} onClick={() => openEdit(shift)} className={`w-full text-left text-[11px] font-semibold px-1.5 py-1 rounded border leading-tight transition-all hover:opacity-80 ${getShiftStatusClass(shift.status || "draft")}`}>
                              <div className="truncate">{fmtTime(shift.startTime!)}–{fmtTime(shift.endTime!)}</div>
                            </button>
                          ))}
                          <button
                            onClick={() => openCreate(null, dateStr)}
                            className="flex items-center justify-center h-6 w-full opacity-0 group-hover:opacity-100 rounded border border-dashed border-border/50 text-muted-foreground hover:border-primary hover:text-primary transition-all text-xs mt-auto"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isManager && (
        <p className="text-xs text-muted-foreground text-center">
          Hover a row and click <strong>+</strong> to add a shift · Click a shift to edit · Background colours show staff leave and availability
        </p>
      )}

      {/* Shift Dialog */}
      <Dialog open={modal.open} onOpenChange={(v) => !v && setModal(m => ({ ...m, open: false }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              {modal.mode === "create" ? "Add Shift" : "Edit Shift"}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {modal.date && format(parseISO(modal.date), "EEEE, MMMM d, yyyy")}
              {" · "}
              {modal.employeeId
                ? employees.find(e => e.id === modal.employeeId)?.name ?? `Employee #${modal.employeeId}`
                : "Open / Unassigned"}
            </DialogDescription>
          </DialogHeader>

          {/* Quick preset selector */}
          {presets.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Quick Presets</Label>
              <div className="flex flex-wrap gap-1.5">
                {presets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.startTime, p.endTime)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-border/60 bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-xs font-semibold transition-all"
                  >
                    <Clock className="h-2.5 w-2.5 text-primary/70" />
                    {p.name}
                    <span className="text-muted-foreground font-normal font-mono">{p.startTime}–{p.endTime}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {leaveWarning?.hasPending && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-400/30 rounded-lg p-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-amber-700 dark:text-amber-400">Pending leave request</p>
                <p className="text-amber-600 dark:text-amber-500 text-xs mt-0.5">
                  This employee has pending {leaveWarning.leaveType} leave on this date. You can still schedule them — it will conflict if the leave is approved.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {isManager && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Employee</Label>
                  <Select value={modal.employeeId?.toString() || "unassigned"} onValueChange={v => setModal(m => ({ ...m, employeeId: v === "unassigned" ? null : parseInt(v) }))} disabled={modal.mode === "edit"}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Open / Unassigned</SelectItem>
                      {employees.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Workplace</Label>
                  <Select value={formValues.workplaceId || "none"} onValueChange={v => setFormValues(f => ({ ...f, workplaceId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="No workplace" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No workplace</SelectItem>
                      {workplaces.map(wp => <SelectItem key={wp.id} value={wp.id.toString()}>{wp.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Start Time</Label>
                <TimePicker value={formValues.startTime} onChange={v => setFormValues(f => ({ ...f, startTime: v }))} label="Start Time" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">End Time</Label>
                <TimePicker value={formValues.endTime} onChange={v => setFormValues(f => ({ ...f, endTime: v }))} label="End Time" />
              </div>
            </div>

            {isManager && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Role / Position <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input placeholder="e.g. Cashier, Supervisor" value={formValues.role} onChange={e => setFormValues(f => ({ ...f, role: e.target.value }))} className="h-9" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea placeholder="Any notes..." value={formValues.notes} onChange={e => setFormValues(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none" />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            {modal.mode === "edit" && isManager && (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting} className="sm:mr-auto">
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            )}
            {modal.mode === "edit" && modal.shift?.status === "draft" && isManager && (
              <Button
                variant="outline" size="sm"
                onClick={handlePublishSingle}
                disabled={publishingId === modal.shift?.id}
                className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                <Send className="w-3.5 h-3.5" />
                {publishingId === modal.shift?.id ? "Publishing..." : "Publish Shift"}
              </Button>
            )}
            {modal.mode === "edit" && modal.shift?.status === "published" && isManager && (
              <Button variant="outline" size="sm" onClick={handleRevertToDraft} disabled={reverting} className="gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20">
                <RotateCcw className="w-3.5 h-3.5" />
                {reverting ? "Reverting..." : "Revert to Draft"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setModal(m => ({ ...m, open: false }))}>Cancel</Button>
            <Button size="sm" className="font-semibold" onClick={handleSubmit} disabled={createShift.isPending || updateShift.isPending}>
              {createShift.isPending || updateShift.isPending ? "Saving..." : modal.mode === "create" ? "Add Shift" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
