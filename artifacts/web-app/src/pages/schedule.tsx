import { useAuth } from "@/hooks/use-auth";
import {
  useListShifts, useListUsers, useListWorkplaces, useListLeaveRequests, useListAvailability,
  useCreateShift, useUpdateShift, useDeleteShift,
  useListShiftPresets, useCreateShiftPreset, useDeleteShiftPreset,
  useGetCompany,
  getListShiftsQueryKey, getListUsersQueryKey, getListWorkplacesQueryKey,
  getListLeaveRequestsQueryKey, getListAvailabilityQueryKey, getListShiftPresetsQueryKey,
  getGetCompanyQueryKey,
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
import { format, startOfWeek, addDays, addWeeks, subWeeks, parseISO, getMonth, getYear } from "date-fns";
import { useState, useMemo, useRef, useEffect } from "react";
import { useSearch } from "wouter";
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays, Trash2, AlertTriangle, Ban,
  Send, RotateCcw, Clock, Settings2, X, CheckSquare, Square, XCircle,
  Download, Upload, CalendarPlus, ArrowLeftRight, Gift, Sparkles, CheckCheck, FileSpreadsheet,
  HandCoins, PackageOpen, Copy, UserCheck,
} from "lucide-react";
import { TimePicker } from "@/components/ui/time-picker";
import { apiCheckLeave } from "@/lib/platform-api";
import {
  listShiftSwaps, requestShiftSwap, respondToSwap,
  listShiftOffers, offerShift, takeShiftOffer, retractShiftOffer,
  listShiftReplacements, requestShiftReplacement, respondToReplacement,
  suggestShifts, approveSuggestions, claimShift,
  type ShiftSwap, type ShiftOffer, type ShiftReplacement,
} from "@/lib/notifications-api";
import { generateIcal, downloadIcal } from "@/lib/ical";
import { openNativeCalendar, downloadIcalFallback } from "@/lib/calendar-deeplink";
import { exportMonthlyRosterCsv, generateTemplateCsv, parseRosterCsv } from "@/lib/roster-csv";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ShiftModal {
  open: boolean;
  mode: "create" | "edit";
  employeeId: number | null;
  date: string;
  shift?: Shift;
}

// Availability slot value types
type SlotValue = boolean | { available: true; startTime?: string; endTime?: string } | { unavailable: true };

function getWeekDates(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function fmtTime(iso: string) {
  const timePart = iso.includes("T") ? iso.split("T")[1] : iso;
  const [hStr, mStr] = timePart!.split(":");
  const h = parseInt(hStr!, 10);
  const m = parseInt(mStr!, 10);
  const period = h >= 12 ? "pm" : "am";
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2, "0")}${period}`;
}

function getShiftStatusClass(status: string, isSuggested?: boolean) {
  if (isSuggested) return "bg-violet-500/15 border-violet-400/40 text-violet-700 dark:text-violet-300";
  if (status === "published") return "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400";
  if (status === "cancelled") return "bg-red-500/10 border-red-400/30 text-red-500 line-through";
  return "bg-muted border-border/70 text-foreground";
}

function isSlotUnavailable(v: SlotValue | undefined): boolean {
  if (!v || v === true) return false;
  return typeof v === "object" && "unavailable" in v && v.unavailable === true;
}

function isSlotAvailable(v: SlotValue | undefined): boolean {
  if (!v) return false;
  if (v === true) return true;
  return typeof v === "object" && "available" in v;
}

export default function SchedulePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isManager = user?.role === "admin" || user?.role === "manager";
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekDates = getWeekDates(weekStart);

  const [modal, setModal] = useState<ShiftModal>({ open: false, mode: "create", employeeId: null, date: "" });
  const [leaveWarning, setLeaveWarning] = useState<{ hasPending?: boolean; leaveType?: string } | null>(null);
  const [formValues, setFormValues] = useState({ startTime: "09:00", endTime: "17:00", workplaceId: "", role: "", notes: "" });
  const [publishing, setPublishing] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reverting, setReverting] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [showPresets, setShowPresets] = useState(false);
  const [newPreset, setNewPreset] = useState({ name: "", startTime: "09:00", endTime: "17:00" });
  const [savingPreset, setSavingPreset] = useState(false);

  // Bulk preset apply: select multiple days for one employee and apply a preset
  const [bulkPresetMode, setBulkPresetMode] = useState(false);
  const [bulkPresetEmpId, setBulkPresetEmpId] = useState<number | null>(null);
  const [bulkSelectedDates, setBulkSelectedDates] = useState<Set<string>>(new Set());
  const [bulkPresetId, setBulkPresetId] = useState<string>("");
  const [bulkApplying, setBulkApplying] = useState(false);

  // Drag-and-drop: dragging a preset chip onto a staff/day cell creates a draft shift
  const [dragPresetId, setDragPresetId] = useState<number | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const [viewShift, setViewShift] = useState<Shift | null>(null);

  // Swap dialog
  const [swapDialog, setSwapDialog] = useState<{ open: boolean; myShiftId?: number }>({ open: false });
  const [swapTargetShiftId, setSwapTargetShiftId] = useState<string>("");
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [swapsLoaded, setSwapsLoaded] = useState(false);
  const [sendingSwap, setSendingSwap] = useState(false);

  // Offer dialog
  const [offerDialog, setOfferDialog] = useState<{ open: boolean; shiftId?: number }>({ open: false });
  const [offers, setOffers] = useState<ShiftOffer[]>([]);
  const [offerLoading, setOfferLoading] = useState(false);

  // Replacement dialog — pick a specific colleague to cover a shift (one-directional)
  const [replacementDialog, setReplacementDialog] = useState<{ open: boolean; shiftId?: number }>({ open: false });
  const [replacementTargetId, setReplacementTargetId] = useState<string>("");
  const [replacements, setReplacements] = useState<ShiftReplacement[]>([]);
  const [replacementsLoaded, setReplacementsLoaded] = useState(false);
  const [sendingReplacement, setSendingReplacement] = useState(false);

  // Suggestion state
  const [suggesting, setSuggesting] = useState(false);
  const [approvingSuggestions, setApprovingSuggestions] = useState(false);
  const [draftingSuggestions, setDraftingSuggestions] = useState(false);

  // Take open shift / offer — confirm before mutating
  const [takeConfirm, setTakeConfirm] = useState<{ open: boolean; kind: "offer" | "unassigned"; offerId?: number; shift?: Shift } | null>(null);
  const [takingShift, setTakingShift] = useState(false);

  // CSV import state
  const [csvImportDialog, setCsvImportDialog] = useState(false);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<{ employeeName: string; dateStr: string; startTime: string; endTime: string; role?: string }[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvMonth, setCsvMonth] = useState(new Date().getMonth() + 1);
  const [csvYear, setCsvYear] = useState(new Date().getFullYear());

  const { data: shifts = [] } = useListShifts({ query: { enabled: !!user?.companyId, queryKey: getListShiftsQueryKey() } });
  const { data: users = [] } = useListUsers({ query: { enabled: !!user?.companyId, queryKey: getListUsersQueryKey() } });
  const { data: workplaces = [] } = useListWorkplaces({ query: { enabled: !!user?.companyId, queryKey: getListWorkplacesQueryKey() } });
  const { data: leaveRequests = [] } = useListLeaveRequests({ query: { enabled: !!user?.companyId, queryKey: getListLeaveRequestsQueryKey() } });
  const { data: availabilityList = [] } = useListAvailability({ query: { enabled: !!user?.companyId, queryKey: getListAvailabilityQueryKey() } });
  const { data: presets = [] } = useListShiftPresets({ query: { enabled: !!user?.companyId && isManager, queryKey: getListShiftPresetsQueryKey() } });
  const { data: company } = useGetCompany(user?.companyId || 0, { query: { enabled: !!user?.companyId, queryKey: getGetCompanyQueryKey(user?.companyId || 0) } });

  const createShift = useCreateShift();
  const updateShift = useUpdateShift();
  const deleteShift = useDeleteShift();
  const createPreset = useCreateShiftPreset();
  const deletePreset = useDeleteShiftPreset();

  // Roster excludes admins — the admin is the company owner, not a scheduled staff member.
  // Managers and employees are the only roles that can have shifts planned.
  const employees = useMemo(
    () => users.filter(u => u.role !== "platform_admin" && u.role !== "admin" && (isManager ? true : u.id === user?.id)),
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
    const map = new Map<string, SlotValue>();
    for (const avail of availabilityList) {
      const slots = avail.slots as Record<string, SlotValue> | null;
      if (!slots) continue;
      for (const [dateStr, val] of Object.entries(slots)) {
        map.set(`${avail.employeeId}:${dateStr}`, val);
      }
    }
    return map;
  }, [availabilityList]);

  // Load open shift offers for everyone (needed for the "Open Shifts" panel + notification actions)
  useEffect(() => {
    if (!user) return;
    listShiftOffers().then(setOffers).catch(() => {});
  }, [user]);

  // Deep-link from notification bell: /schedule?panel=swaps|offers|replacements auto-opens the relevant panel
  const search = useSearch();
  useEffect(() => {
    if (!user || isManager) return;
    const params = new URLSearchParams(search);
    const panel = params.get("panel");
    if (panel === "swaps") { loadSwaps(); setSwapDialog({ open: true }); }
    else if (panel === "replacements") { loadReplacements(); setReplacementDialog({ open: true }); }
    // "offers" panel is the always-visible "Open Shifts Available" banner — nothing to open explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, user, isManager]);

  function toggleSelectMode() { setSelectMode(v => !v); setSelectedIds(new Set()); }
  function toggleShiftSelected(id: number) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map(id => deleteShift.mutateAsync({ id })));
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      toast({ title: `${ids.length} shift${ids.length > 1 ? "s" : ""} deleted` });
      setSelectedIds(new Set()); setSelectMode(false);
    } catch { toast({ title: "Some shifts could not be deleted", variant: "destructive" }); qc.invalidateQueries({ queryKey: getListShiftsQueryKey() }); }
    finally { setBulkDeleting(false); }
  }

  function openCreate(employeeId: number | null, dateStr: string) {
    setFormValues({ startTime: "09:00", endTime: "17:00", workplaceId: "", role: "", notes: "" });
    setLeaveWarning(null);
    setModal({ open: true, mode: "create", employeeId, date: dateStr });
    if (employeeId) {
      apiCheckLeave(employeeId, dateStr).then(res => {
        if (res.hasConflict) {
          toast({ title: "Cannot schedule", description: `Employee has approved ${res.leaveType} leave on this date.`, variant: "destructive" });
          setModal(m => ({ ...m, open: false }));
        } else if (res.hasPending) setLeaveWarning({ hasPending: true, leaveType: res.leaveType });
      });
    }
  }

  function openEdit(shift: Shift) {
    const dateStr = shift.startTime!.includes("T") ? shift.startTime!.split("T")[0] : format(new Date(shift.startTime!), "yyyy-MM-dd");
    const startTimePart = shift.startTime!.includes("T") ? shift.startTime!.split("T")[1]!.slice(0, 5) : format(new Date(shift.startTime!), "HH:mm");
    const endTimePart = shift.endTime ? (shift.endTime.includes("T") ? shift.endTime.split("T")[1]!.slice(0, 5) : format(new Date(shift.endTime), "HH:mm")) : "17:00";
    setFormValues({ startTime: startTimePart, endTime: endTimePart, workplaceId: shift.workplaceId?.toString() || "", role: shift.role || "", notes: shift.notes || "" });
    setLeaveWarning(null);
    setModal({ open: true, mode: "edit", employeeId: shift.employeeId || null, date: dateStr!, shift });
  }

  function applyPreset(startTime: string, endTime: string) { setFormValues(f => ({ ...f, startTime, endTime })); }

  async function handleSubmit() {
    if (!formValues.startTime || !formValues.endTime) return;
    const startISO = `${modal.date}T${formValues.startTime}:00`;
    const endISO = `${modal.date}T${formValues.endTime}:00`;
    const payload = {
      startTime: startISO, endTime: endISO,
      employeeId: modal.employeeId || null,
      workplaceId: formValues.workplaceId ? parseInt(formValues.workplaceId) : null,
      role: formValues.role || null, notes: formValues.notes || null,
    };
    if (modal.mode === "create") {
      createShift.mutate({ data: payload as any }, {
        onSuccess: () => { toast({ title: "Shift created" }); qc.invalidateQueries({ queryKey: getListShiftsQueryKey() }); setModal(m => ({ ...m, open: false })); },
        onError: (err: any) => { toast({ title: "Error", description: err?.data?.error || "Failed to create shift", variant: "destructive" }); }
      });
    } else if (modal.shift) {
      updateShift.mutate({ id: modal.shift.id, data: payload as any }, {
        onSuccess: () => { toast({ title: "Shift updated" }); qc.invalidateQueries({ queryKey: getListShiftsQueryKey() }); setModal(m => ({ ...m, open: false })); },
        onError: (err: any) => { toast({ title: "Error", description: err?.data?.error || "Failed to update", variant: "destructive" }); }
      });
    }
  }

  async function handleDelete() {
    if (!modal.shift) return;
    setDeleting(true);
    deleteShift.mutate({ id: modal.shift.id }, {
      onSuccess: () => { toast({ title: "Shift deleted" }); qc.invalidateQueries({ queryKey: getListShiftsQueryKey() }); setModal(m => ({ ...m, open: false })); setDeleting(false); }
    });
  }

  async function handleRevertToDraft() {
    if (!modal.shift) return; setReverting(true);
    updateShift.mutate({ id: modal.shift.id, data: { status: "draft" } as any }, {
      onSuccess: () => { toast({ title: "Shift reverted to draft" }); qc.invalidateQueries({ queryKey: getListShiftsQueryKey() }); setModal(m => ({ ...m, open: false })); setReverting(false); },
      onError: () => { toast({ title: "Failed to revert", variant: "destructive" }); setReverting(false); }
    });
  }

  async function handlePublishSingle() {
    if (!modal.shift) return; setPublishingId(modal.shift.id);
    updateShift.mutate({ id: modal.shift.id, data: { status: "published" } as any }, {
      onSuccess: () => { toast({ title: "Shift published" }); qc.invalidateQueries({ queryKey: getListShiftsQueryKey() }); setModal(m => ({ ...m, open: false })); setPublishingId(null); },
      onError: () => { toast({ title: "Failed to publish", variant: "destructive" }); setPublishingId(null); }
    });
  }

  async function publishAll() {
    const draftShifts = shifts.filter(s => s.status === "draft" && !(s as any).isSuggested);
    if (!draftShifts.length) { toast({ title: "No drafts", description: "All shifts are already published." }); return; }
    setPublishing(true);
    try {
      await Promise.all(draftShifts.map(s => updateShift.mutateAsync({ id: s.id, data: { status: "published" } as any })));
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      toast({ title: `${draftShifts.length} shift${draftShifts.length > 1 ? "s" : ""} published` });
    } catch { toast({ title: "Publish failed", variant: "destructive" }); }
    finally { setPublishing(false); }
  }

  async function handleSavePreset() {
    if (!newPreset.name.trim()) return; setSavingPreset(true);
    createPreset.mutate({ data: { name: newPreset.name.trim(), startTime: newPreset.startTime, endTime: newPreset.endTime } }, {
      onSuccess: () => { toast({ title: "Preset saved" }); qc.invalidateQueries({ queryKey: getListShiftPresetsQueryKey() }); setNewPreset({ name: "", startTime: "09:00", endTime: "17:00" }); setSavingPreset(false); },
      onError: () => { toast({ title: "Failed to save preset", variant: "destructive" }); setSavingPreset(false); }
    });
  }

  function handleDeletePreset(id: number) {
    deletePreset.mutate({ id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListShiftPresetsQueryKey() }); toast({ title: "Preset deleted" }); } });
  }

  // Drag a preset chip onto a staff/day cell → creates a new draft shift for that employee/date
  function handlePresetDragStart(e: React.DragEvent, presetId: number) {
    e.dataTransfer.setData("text/plain", String(presetId));
    e.dataTransfer.effectAllowed = "copy";
    setDragPresetId(presetId);
  }
  function handlePresetDragEnd() {
    setDragPresetId(null);
    setDropTargetKey(null);
  }
  function handleCellDragOver(e: React.DragEvent, key: string) {
    if (dragPresetId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropTargetKey(key);
  }
  function handleCellDragLeave(key: string) {
    setDropTargetKey(prev => (prev === key ? null : prev));
  }
  function handlePresetDrop(e: React.DragEvent, empId: number, dateStr: string) {
    e.preventDefault();
    setDropTargetKey(null);
    const presetIdStr = e.dataTransfer.getData("text/plain");
    setDragPresetId(null);
    const preset = presets.find(p => String(p.id) === presetIdStr);
    if (!preset) return;
    const leave = leaveByEmpAndDate.get(`${empId}:${dateStr}`);
    if (leave?.status === "approved") {
      toast({ title: "Cannot schedule", description: `Employee has approved ${leave.type} leave on this date.`, variant: "destructive" });
      return;
    }
    createShift.mutate({ data: {
      employeeId: empId,
      startTime: `${dateStr}T${preset.startTime}:00`,
      endTime: `${dateStr}T${preset.endTime}:00`,
      status: "draft",
    } as any }, {
      onSuccess: () => { toast({ title: `"${preset.name}" added as draft` }); qc.invalidateQueries({ queryKey: getListShiftsQueryKey() }); },
      onError: (err: any) => { toast({ title: "Error", description: err?.data?.error || "Failed to create shift", variant: "destructive" }); }
    });
  }

  // Bulk preset apply
  function startBulkPreset(empId: number | null) {
    setBulkPresetMode(true); setBulkPresetEmpId(empId); setBulkSelectedDates(new Set()); setBulkPresetId("");
  }
  function toggleBulkDate(dateStr: string) {
    setBulkSelectedDates(prev => { const next = new Set(prev); if (next.has(dateStr)) next.delete(dateStr); else next.add(dateStr); return next; });
  }
  async function applyBulkPreset() {
    if (!bulkPresetId || bulkSelectedDates.size === 0 || !bulkPresetEmpId) return;
    const preset = presets.find(p => String(p.id) === bulkPresetId);
    if (!preset) return;
    setBulkApplying(true);
    try {
      await Promise.all(Array.from(bulkSelectedDates).map(dateStr =>
        createShift.mutateAsync({ data: {
          employeeId: bulkPresetEmpId,
          startTime: `${dateStr}T${preset.startTime}:00`,
          endTime: `${dateStr}T${preset.endTime}:00`,
          status: "draft",
        } as any })
      ));
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      toast({ title: `Applied "${preset.name}" to ${bulkSelectedDates.size} day${bulkSelectedDates.size > 1 ? "s" : ""}` });
      setBulkPresetMode(false); setBulkPresetEmpId(null); setBulkSelectedDates(new Set());
    } catch { toast({ title: "Failed to apply presets", variant: "destructive" }); }
    finally { setBulkApplying(false); }
  }

  // Add to Calendar export — covers every published shift (not just the visible week).
  // On mobile, try the native share sheet so the .ics can be opened straight in a calendar app;
  // otherwise fall back to a plain download.
  async function handleIcalExport() {
    try {
      // Primary path: native deep-link via webcal:// / https:// — opens the
      // user's calendar app directly instead of downloading a .ics file.
      // See lib/calendar-deeplink.ts for the full platform matrix.
      await openNativeCalendar();
      toast({
        title: "Opening your calendar…",
        description: "If nothing happens, your device has no calendar app registered for .ics URLs — use the in-app menu to download instead.",
      });
      return;
    } catch (err: any) {
      // Mint can fail if the user is signed out or the API rejects the
      // request. Fall back to a one-shot download so the user is never
      // left without an option.
      // eslint-disable-next-line no-console
      console.warn("Calendar deep-link failed, falling back to download", err);
    }

    // Fallback path: original client-side generation + browser download.
    // Preserved for offline / restricted environments.
    const myShifts = shifts.filter(s => {
      if (s.status !== "published") return false;
      if (!isManager) return s.employeeId === user?.id;
      return true;
    });
    const calShifts = myShifts.map(s => {
      const wp = workplaces.find(w => w.id === s.workplaceId);
      return {
        id: s.id, startTime: s.startTime!, endTime: s.endTime!,
        role: s.role, notes: s.notes, workplaceName: wp?.name, workplaceAddress: wp?.address,
        companyName: (company as any)?.name,
      };
    });
    const ical = generateIcal(calShifts, `${(company as any)?.name ?? "SYNTRA"} Shifts`);
    downloadIcalFallback(ical, "syntra-shifts.ics");
    toast({ title: "Calendar file downloaded", description: `${calShifts.length} shift${calShifts.length !== 1 ? "s" : ""} exported — open the file to add them to your calendar.` });
  }

  // CSV export
  function handleCsvExport() {
    const now = new Date();
    const year = getYear(now);
    const month = getMonth(now) + 1;
    const monthShifts = shifts.filter(s => {
      if (!s.startTime) return false;
      const d = new Date(s.startTime);
      return getYear(d) === year && getMonth(d) + 1 === month;
    });
    const empUsers = employees.map(e => ({ id: e.id, name: e.name }));
    const shiftRows = monthShifts.filter(s => s.employeeId).map(s => ({
      employeeId: s.employeeId!, startTime: s.startTime!, endTime: s.endTime!, role: s.role, status: s.status,
    }));
    const csv = exportMonthlyRosterCsv(empUsers, shiftRows, year, month, (company as any)?.currency);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `roster-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    toast({ title: "Roster CSV downloaded" });
  }

  // CSV template download
  function handleCsvTemplate() {
    const empUsers = employees.map(e => ({ id: e.id, name: e.name }));
    const csv = generateTemplateCsv(empUsers, csvYear, csvMonth);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `roster-template-${csvYear}-${String(csvMonth).padStart(2, "0")}.csv`;
    a.click();
  }

  // CSV import parse
  function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const empUsers = employees.map(e => ({ id: e.id, name: e.name }));
      const { rows, errors } = parseRosterCsv(text, empUsers, csvYear, csvMonth);
      setCsvPreview(rows); setCsvErrors(errors);
    };
    reader.readAsText(file);
  }

  async function handleCsvImport() {
    if (csvPreview.length === 0) return;
    setCsvImporting(true);
    try {
      const empByName = new Map(employees.map(e => [e.name.toLowerCase(), e.id]));
      await Promise.all(csvPreview.map(row => {
        const empId = empByName.get(row.employeeName.toLowerCase());
        if (!empId) return Promise.resolve();
        return createShift.mutateAsync({ data: {
          employeeId: empId, startTime: row.startTime, endTime: row.endTime,
          role: row.role || null, status: "draft",
        } as any });
      }));
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      toast({ title: `${csvPreview.length} shifts imported as drafts` });
      setCsvImportDialog(false); setCsvPreview([]); setCsvErrors([]);
      if (csvInputRef.current) csvInputRef.current.value = "";
    } catch { toast({ title: "Import failed", variant: "destructive" }); }
    finally { setCsvImporting(false); }
  }

  // Swap request
  async function loadSwaps() {
    if (swapsLoaded) return;
    try { const data = await listShiftSwaps(); setSwaps(data); setSwapsLoaded(true); } catch {}
  }

  async function handleSendSwap() {
    if (!swapDialog.myShiftId || !swapTargetShiftId) return;
    setSendingSwap(true);
    try {
      await requestShiftSwap(swapDialog.myShiftId, parseInt(swapTargetShiftId));
      toast({ title: "Swap request sent" });
      setSwapDialog({ open: false }); setSwapTargetShiftId("");
    } catch (err: any) {
      toast({ title: "Failed to send swap", description: err?.data?.error, variant: "destructive" });
    } finally { setSendingSwap(false); }
  }

  async function handleRespondSwap(swapId: number, action: "accept" | "reject") {
    try {
      await respondToSwap(swapId, action);
      toast({ title: action === "accept" ? "Swap accepted" : "Swap declined" });
      const data = await listShiftSwaps(); setSwaps(data);
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.data?.error, variant: "destructive" });
    }
  }

  // Shift replacement — one-directional: pick a specific colleague to cover a shift
  async function loadReplacements() {
    if (replacementsLoaded) return;
    try { const data = await listShiftReplacements(); setReplacements(data); setReplacementsLoaded(true); } catch {}
  }

  async function handleSendReplacement() {
    if (!replacementDialog.shiftId || !replacementTargetId) return;
    setSendingReplacement(true);
    try {
      await requestShiftReplacement(replacementDialog.shiftId, parseInt(replacementTargetId));
      toast({ title: "Replacement request sent" });
      setReplacementDialog({ open: false }); setReplacementTargetId("");
    } catch (err: any) {
      toast({ title: "Failed to send request", description: err?.data?.error, variant: "destructive" });
    } finally { setSendingReplacement(false); }
  }

  async function handleRespondReplacement(replacementId: number, action: "accept" | "reject") {
    try {
      await respondToReplacement(replacementId, action);
      toast({ title: action === "accept" ? "You're covering that shift now" : "Request declined" });
      const data = await listShiftReplacements(); setReplacements(data);
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.data?.error, variant: "destructive" });
    }
  }

  // Shift offer
  async function handleOfferShift() {
    if (!offerDialog.shiftId) return; setOfferLoading(true);
    try {
      await offerShift(offerDialog.shiftId);
      toast({ title: "Shift offered — all team members notified" });
      setOfferDialog({ open: false });
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.data?.error, variant: "destructive" });
    } finally { setOfferLoading(false); }
  }

  // Suggest shifts
  async function handleSuggest() {
    setSuggesting(true);
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    try {
      const result = await suggestShifts(weekStartStr);
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      toast({ title: `${result.inserted} suggested shift${result.inserted !== 1 ? "s" : ""} created`, description: "Shown in purple — approve all below the grid." });
    } catch (err: any) {
      toast({ title: "Suggestion failed", description: err?.data?.error, variant: "destructive" });
    } finally { setSuggesting(false); }
  }

  async function handleApproveSuggestions() {
    setApprovingSuggestions(true);
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    try {
      const result = await approveSuggestions(weekStartStr, true);
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      toast({ title: `${result.approved} suggested shift${result.approved !== 1 ? "s" : ""} published` });
    } catch (err: any) {
      toast({ title: "Approve failed", description: err?.data?.error, variant: "destructive" });
    } finally { setApprovingSuggestions(false); }
  }

  // Move suggested shifts into the regular draft pool without publishing them yet.
  async function handleAddSuggestionsToDraft() {
    setDraftingSuggestions(true);
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    try {
      const result = await approveSuggestions(weekStartStr, false);
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      toast({ title: `${result.approved} suggested shift${result.approved !== 1 ? "s" : ""} added to drafts`, description: "Review and publish them whenever you're ready." });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.data?.error, variant: "destructive" });
    } finally { setDraftingSuggestions(false); }
  }

  // Take an offered shift, or claim an unassigned open shift — always confirm first.
  async function handleConfirmTake() {
    if (!takeConfirm) return;
    setTakingShift(true);
    try {
      if (takeConfirm.kind === "offer" && takeConfirm.offerId) {
        await takeShiftOffer(takeConfirm.offerId);
      } else if (takeConfirm.kind === "unassigned" && takeConfirm.shift) {
        await claimShift(takeConfirm.shift.id);
      }
      toast({ title: "Shift taken — it's now on your schedule" });
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      setOffers(await listShiftOffers());
      setTakeConfirm(null);
    } catch (err: any) {
      toast({ title: "Couldn't take shift", description: err?.data?.error ?? "It may have already been taken.", variant: "destructive" });
    } finally { setTakingShift(false); }
  }

  function getCellBg(empId: number, dateStr: string) {
    const leave = leaveByEmpAndDate.get(`${empId}:${dateStr}`);
    if (leave?.status === "approved") return "bg-red-500/10";
    if (leave?.status === "pending") return "bg-amber-500/10";
    const slotVal = availByEmpAndDate.get(`${empId}:${dateStr}`);
    if (isSlotUnavailable(slotVal)) return "bg-red-500/8";
    if (isSlotAvailable(slotVal)) return "bg-emerald-500/8";
    return "";
  }

  const draftCount = shifts.filter(s => s.status === "draft" && !(s as any).isSuggested).length;
  const suggestedCount = shifts.filter(s => (s as any).isSuggested === true && s.status === "draft" &&
    (() => { const d = new Date(s.startTime!); const ws = weekStart; const we = addDays(ws, 6); return d >= ws && d <= we; })()
  ).length;

  // All published shifts by other employees this week (for swap target selection)
  const otherPublishedShifts = useMemo(() =>
    shifts.filter(s => s.status === "published" && s.employeeId && s.employeeId !== user?.id &&
      (() => { const d = new Date(s.startTime!); return d >= weekStart && d <= addDays(weekStart, 6); })()
    ), [shifts, weekStart, user]);

  // My published shifts this week (for swap source)
  const myPublishedShifts = useMemo(() =>
    shifts.filter(s => s.status === "published" && s.employeeId === user?.id &&
      (() => { const d = new Date(s.startTime!); return d >= weekStart && d <= addDays(weekStart, 6); })()
    ), [shifts, weekStart, user]);

  // Pending swap requests targeting me
  const pendingSwapsForMe = useMemo(() => swaps.filter(s => s.targetEmployeeId === user?.id && s.status === "pending"), [swaps, user]);
  // Pending replacement requests targeting me
  const pendingReplacementsForMe = useMemo(() => replacements.filter(r => r.targetEmployeeId === user?.id && r.status === "pending"), [replacements, user]);
  // Colleagues who could cover a shift — scheduled staff only (admins are owners, not staff)
  const replacementCandidates = useMemo(() => users.filter(u => u.role !== "platform_admin" && u.role !== "admin" && u.id !== user?.id), [users, user]);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const shiftsById = useMemo(() => new Map(shifts.map(s => [s.id, s])), [shifts]);

  // Open shifts anyone can take: offered shifts (by a colleague) + unassigned published shifts
  const openOffers = useMemo(
    () => offers.filter(o => o.status === "open" && o.offeredBy !== user?.id),
    [offers, user],
  );
  const openUnassignedShifts = useMemo(
    () => shifts.filter(s => !s.employeeId && s.status === "published"),
    [shifts],
  );
  const hasOpenShiftsForMe = !isManager && (openOffers.length > 0 || openUnassignedShifts.length > 0);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-sans tracking-tight">Roster</h1>
          <p className="text-muted-foreground text-xs font-mono uppercase tracking-widest mt-0.5">
            Week of {format(weekStart, "MMM d, yyyy")} · {(company as any)?.timezone ?? "UTC"}
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          {/* Week nav */}
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

          {/* Add to Calendar — deep-links to the native calendar app via
              webcal:// (iOS/macOS/Android) or opens the .ics in the browser
              (Windows/Linux). Falls back to a one-shot download if neither
              path is available. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-mono" onClick={handleIcalExport}>
                <CalendarPlus className="h-3.5 w-3.5" /> Add to Calendar
              </Button>
            </TooltipTrigger>
            <TooltipContent>Opens your calendar app with every published shift (Apple Calendar, Google Calendar, Outlook)</TooltipContent>
          </Tooltip>

          {/* Manager tools */}
          {isManager && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-mono" onClick={handleCsvExport}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export this month's roster as CSV</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-mono" onClick={() => setCsvImportDialog(true)}>
                    <Upload className="h-3.5 w-3.5" /> Import
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Import shifts from CSV</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-mono" onClick={() => setShowPresets(p => !p)}>
                    <Settings2 className="h-3.5 w-3.5" /> Presets
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Manage shift time presets</TooltipContent>
              </Tooltip>
              <Button variant={selectMode ? "secondary" : "outline"} size="sm" className="h-8 gap-1.5 text-xs font-mono" onClick={toggleSelectMode}>
                {selectMode ? <XCircle className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                {selectMode ? "Cancel" : "Select"}
              </Button>
              {presets.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant={bulkPresetMode ? "secondary" : "outline"} size="sm" className="h-8 gap-1.5 text-xs font-mono" onClick={() => bulkPresetMode ? (setBulkPresetMode(false), setBulkPresetEmpId(null), setBulkSelectedDates(new Set())) : startBulkPreset(null)}>
                      <Copy className="h-3.5 w-3.5" /> Bulk Apply
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Apply a preset to many days at once for a staff member</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-mono" onClick={handleSuggest} disabled={suggesting}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {suggesting ? "Thinking..." : "Suggest"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Auto-suggest shifts based on last week's roster</TooltipContent>
              </Tooltip>
              {draftCount > 0 && !selectMode && (
                <Button size="sm" className="font-semibold gap-1.5" onClick={publishAll} disabled={publishing}>
                  <Send className="h-3.5 w-3.5" />
                  {publishing ? "Publishing..." : `Publish ${draftCount} Draft${draftCount > 1 ? "s" : ""}`}
                </Button>
              )}
            </>
          )}

          {/* Employee: Swaps + Replacements + Offers */}
          {!isManager && (
            <>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-mono" onClick={() => { loadSwaps(); setSwapDialog({ open: true }); }}>
                <ArrowLeftRight className="h-3.5 w-3.5" /> Swaps
              </Button>
              {pendingSwapsForMe.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center -ml-2 -mt-2">
                  {pendingSwapsForMe.length}
                </span>
              )}
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-mono" onClick={() => { loadReplacements(); setReplacementDialog({ open: true }); }}>
                <UserCheck className="h-3.5 w-3.5" /> Replacements
              </Button>
              {pendingReplacementsForMe.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center -ml-2 -mt-2">
                  {pendingReplacementsForMe.length}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Approve suggestions banner */}
      {isManager && suggestedCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-400/40 bg-violet-500/8 px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <span className="font-semibold">{suggestedCount} suggested shift{suggestedCount !== 1 ? "s" : ""} waiting for approval</span>
            <span className="text-muted-foreground text-xs hidden sm:inline">— review purple shifts below, then approve all or edit individually</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 font-semibold" onClick={handleAddSuggestionsToDraft} disabled={draftingSuggestions || approvingSuggestions}>
              <RotateCcw className="h-3.5 w-3.5" />
              {draftingSuggestions ? "Adding..." : "Add to Draft"}
            </Button>
            <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold" onClick={handleApproveSuggestions} disabled={approvingSuggestions || draftingSuggestions}>
              <CheckCheck className="h-3.5 w-3.5" />
              {approvingSuggestions ? "Publishing..." : "Approve & Publish"}
            </Button>
          </div>
        </div>
      )}

      {/* Preset Panel */}
      {isManager && showPresets && (
        <div className="border border-border/60 rounded-xl bg-card/80 backdrop-blur shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Shift Presets</h3>
              <span className="text-xs text-muted-foreground font-mono">(drag onto the roster to add as a draft, or click in the shift modal to auto-fill)</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowPresets(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.length === 0 && <span className="text-xs text-muted-foreground italic">No presets yet.</span>}
            {presets.map(p => (
              <div
                key={p.id}
                draggable
                onDragStart={e => handlePresetDragStart(e, p.id)}
                onDragEnd={handlePresetDragEnd}
                className="flex items-center gap-1 px-2.5 py-1 bg-primary/8 border border-primary/20 rounded-full text-xs font-semibold group cursor-grab active:cursor-grabbing"
              >
                <Clock className="h-3 w-3 text-primary/70" />
                <span>{p.name}</span>
                <span className="text-muted-foreground font-normal font-mono">{p.startTime}–{p.endTime}</span>
                <button onClick={() => handleDeletePreset(p.id)} className="ml-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-border/40">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Name</Label>
              <Input placeholder="e.g. Morning" value={newPreset.name} onChange={e => setNewPreset(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm w-40" />
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
              <Plus className="h-3 w-3" />{savingPreset ? "Saving..." : "Save Preset"}
            </Button>
          </div>
        </div>
      )}

      {/* Bulk preset apply mode panel */}
      {isManager && bulkPresetMode && (
        <div className="border border-primary/40 rounded-xl bg-primary/5 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-primary flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Bulk Apply Preset
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setBulkPresetMode(false); setBulkPresetEmpId(null); setBulkSelectedDates(new Set()); }}>
              Cancel
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={bulkPresetEmpId ? String(bulkPresetEmpId) : ""} onValueChange={v => { setBulkPresetEmpId(parseInt(v)); setBulkSelectedDates(new Set()); }}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Choose staff member" /></SelectTrigger>
              <SelectContent>
                {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={bulkPresetId} onValueChange={setBulkPresetId}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Choose preset" /></SelectTrigger>
              <SelectContent>
                {presets.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.startTime}–{p.endTime})</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {bulkPresetEmpId ? "Now click days in the roster below to select them →" : "Pick a staff member, then click days in the roster to select them"}
            </span>
            {bulkSelectedDates.size > 0 && (
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={applyBulkPreset} disabled={bulkApplying || !bulkPresetId}>
                <Plus className="h-3 w-3" /> Apply to {bulkSelectedDates.size} day{bulkSelectedDates.size !== 1 ? "s" : ""}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Open Shifts for staff: offered-by-colleague shifts + unassigned open shifts, with a Take action */}
      {hasOpenShiftsForMe && (
        <div className="border border-amber-400/40 rounded-xl bg-amber-500/8 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <PackageOpen className="h-4 w-4" /> Open Shifts Available
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {openOffers.map(o => {
              const shift = shiftsById.get(o.shiftId);
              const offerer = userMap.get(o.offeredBy);
              if (!shift) return null;
              return (
                <div key={`offer-${o.id}`} className="flex items-center justify-between gap-2 p-2.5 bg-card rounded-lg border border-border/60">
                  <div className="text-xs">
                    <div className="font-bold">{format(new Date(shift.startTime!), "EEE MMM d")} · {fmtTime(shift.startTime!)}–{fmtTime(shift.endTime!)}</div>
                    <div className="text-muted-foreground">Offered by {offerer?.name ?? "a colleague"}{shift.role ? ` · ${shift.role}` : ""}</div>
                  </div>
                  <Button size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={() => setTakeConfirm({ open: true, kind: "offer", offerId: o.id, shift })}>
                    <HandCoins className="h-3 w-3" /> Take
                  </Button>
                </div>
              );
            })}
            {openUnassignedShifts.map(shift => (
              <div key={`unassigned-${shift.id}`} className="flex items-center justify-between gap-2 p-2.5 bg-card rounded-lg border border-border/60">
                <div className="text-xs">
                  <div className="font-bold">{format(new Date(shift.startTime!), "EEE MMM d")} · {fmtTime(shift.startTime!)}–{fmtTime(shift.endTime!)}</div>
                  <div className="text-muted-foreground">Unassigned{shift.role ? ` · ${shift.role}` : ""}</div>
                </div>
                <Button size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={() => setTakeConfirm({ open: true, kind: "unassigned", shift })}>
                  <HandCoins className="h-3 w-3" /> Take
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {[
          { color: "bg-emerald-500/20 border border-emerald-500/30", label: "Available" },
          { color: "bg-red-500/15 border border-red-400/30", label: "Unavailable / Leave" },
          { color: "bg-amber-500/20 border border-amber-500/30", label: "Pending leave" },
          { color: "bg-emerald-500/20 border border-emerald-500/40", label: "Published" },
          { color: "bg-violet-500/20 border border-violet-400/40", label: "Suggested" },
          { color: "bg-muted border border-border", label: "Draft" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded ${color}`} />
            {label}
          </span>
        ))}
      </div>

      {/* Bulk select action bar */}
      {selectMode && (
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-semibold">{selectedIds.size === 0 ? "Tap shifts to select them" : `${selectedIds.size} shift${selectedIds.size > 1 ? "s" : ""} selected`}</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}>Clear</Button>
            <Button variant="destructive" size="sm" className="h-7 gap-1.5 text-xs font-semibold" onClick={handleBulkDelete} disabled={selectedIds.size === 0 || bulkDeleting}>
              <Trash2 className="h-3.5 w-3.5" />{bulkDeleting ? "Deleting..." : "Delete Selected"}
            </Button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="border border-border/50 rounded-xl overflow-hidden shadow-md bg-card">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border/50">
                <th className="sticky left-0 z-10 bg-muted/80 backdrop-blur w-10 sm:w-28 min-w-[40px] sm:min-w-[110px] text-left px-1 sm:px-3 py-3 text-xs uppercase tracking-wider font-mono text-muted-foreground border-r border-border/50">
                  <span className="hidden sm:inline">Staff</span>
                </th>
                {weekDates.map((d, i) => {
                  const isToday = format(new Date(), "yyyy-MM-dd") === format(d, "yyyy-MM-dd");
                  return (
                    <th key={i} className={`py-2 sm:py-3 px-0 sm:px-1 text-center text-[9px] sm:text-xs uppercase tracking-wider font-mono border-r last:border-r-0 border-border/30 ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                      <div className="font-bold">{DAYS[i]!.slice(0, 1)}<span className="hidden sm:inline">{DAYS[i]!.slice(1)}</span></div>
                      <div className={`text-sm sm:text-base font-bold mt-0.5 ${isToday ? "text-primary" : "text-foreground"}`}>{format(d, "d")}</div>
                      <div className="hidden sm:block text-[10px] opacity-60 font-normal">{format(d, "MMM")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {employees.map(emp => (
                <tr key={emp.id} className="group hover:bg-muted/10 transition-colors">
                  <td className="sticky left-0 z-10 bg-card border-r border-border/50 px-1 sm:px-3 py-2 w-10 sm:w-28 min-w-[40px] sm:min-w-[110px]">
                    <div className="flex flex-col items-center gap-0.5 sm:hidden">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary flex-shrink-0">{emp.name.slice(0, 2).toUpperCase()}</div>
                      <div className="text-[8px] font-semibold text-center leading-tight w-full truncate">{emp.name.split(" ")[0]}</div>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-bold text-primary flex-shrink-0">{emp.name.slice(0, 2).toUpperCase()}</div>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs truncate">{emp.name.split(" ")[0]}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">{emp.role}</div>
                        {isManager && presets.length > 0 && (
                          <button onClick={() => startBulkPreset(emp.id)} className="text-[9px] text-primary/70 hover:text-primary font-mono hover:underline leading-tight">+ bulk preset</button>
                        )}
                      </div>
                    </div>
                  </td>
                  {weekDates.map((d, i) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const cellShifts = shiftsByEmpAndDate.get(`${emp.id}:${dateStr}`) || [];
                    const leave = leaveByEmpAndDate.get(`${emp.id}:${dateStr}`);
                    const isApprovedLeave = leave?.status === "approved";
                    const isPendingLeave = leave?.status === "pending";
                    const slotVal = availByEmpAndDate.get(`${emp.id}:${dateStr}`);
                    const isUnavail = isSlotUnavailable(slotVal);
                    const isBulkSelecting = bulkPresetMode && bulkPresetEmpId === emp.id;
                    const isBulkSelected = isBulkSelecting && bulkSelectedDates.has(dateStr);
                    const cellKey = `${emp.id}:${dateStr}`;
                    const isDropTarget = dropTargetKey === cellKey;
                    return (
                      <td
                        key={i}
                        className={`border-r last:border-r-0 border-border/30 align-top p-1 ${getCellBg(emp.id, dateStr)} ${isBulkSelecting ? "cursor-pointer" : ""} ${isBulkSelected ? "ring-2 ring-inset ring-primary/60" : ""} ${isDropTarget ? "ring-2 ring-inset ring-accent bg-accent/10" : ""}`}
                        onClick={isBulkSelecting ? () => toggleBulkDate(dateStr) : undefined}
                        onDragOver={isManager ? (e) => handleCellDragOver(e, cellKey) : undefined}
                        onDragLeave={isManager ? () => handleCellDragLeave(cellKey) : undefined}
                        onDrop={isManager ? (e) => handlePresetDrop(e, emp.id, dateStr) : undefined}
                      >
                        <div className="flex flex-col gap-0.5 min-h-[52px]">
                          {isApprovedLeave && (
                            <div className="flex items-center gap-0.5 px-1 py-0.5 bg-red-500/15 text-red-600 dark:text-red-400 rounded text-[8px] sm:text-[10px] font-semibold border border-red-400/30">
                              <Ban className="w-2 h-2 sm:w-2.5 sm:h-2.5 flex-shrink-0" />
                              <span className="capitalize">{leave!.type}</span>
                            </div>
                          )}
                          {isPendingLeave && !isApprovedLeave && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-0.5 px-1 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded text-[8px] sm:text-[10px] font-semibold border border-amber-400/30 cursor-help">
                                  <AlertTriangle className="w-2 h-2 sm:w-2.5 sm:h-2.5 flex-shrink-0" />
                                  <span className="capitalize">{leave!.type}?</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Pending leave — {leave!.type}</TooltipContent>
                            </Tooltip>
                          )}
                          {isUnavail && !isApprovedLeave && (
                            <div className="flex items-center gap-0.5 px-1 py-0.5 bg-red-500/15 text-red-500 rounded text-[8px] sm:text-[10px] font-semibold border border-red-400/20">
                              <X className="w-2 h-2 flex-shrink-0" />
                              <span>Unavail</span>
                            </div>
                          )}
                          {cellShifts.map(shift => {
                            const isSug = (shift as any).isSuggested === true;
                            return (
                              <button
                                key={shift.id}
                                onClick={() => isManager
                                  ? (selectMode ? toggleShiftSelected(shift.id) : openEdit(shift))
                                  : (shift.status === "published" ? setViewShift(shift) : undefined)
                                }
                                className={`relative w-full text-center text-[9px] sm:text-[11px] font-semibold px-1 py-1 rounded border leading-tight transition-all ${getShiftStatusClass(shift.status || "draft", isSug)} ${isManager || shift.status === "published" ? "cursor-pointer hover:opacity-80" : "cursor-default"} ${selectMode && selectedIds.has(shift.id) ? "ring-2 ring-primary ring-offset-1" : ""}`}
                              >
                                {selectMode && isManager && (
                                  <span className="absolute top-0.5 right-0.5">
                                    {selectedIds.has(shift.id) ? <CheckSquare className="w-3 h-3 text-primary" /> : <Square className="w-3 h-3 text-muted-foreground/50" />}
                                  </span>
                                )}
                                {isSug && <span className="absolute top-0.5 left-0.5"><Sparkles className="w-2.5 h-2.5 text-violet-500" /></span>}
                                <div className="leading-snug">
                                  {fmtTime(shift.startTime!)}<br className="sm:hidden"/>
                                  <span className="hidden sm:inline">–</span>{fmtTime(shift.endTime!)}
                                </div>
                                {isSug && <div className="text-[8px] font-normal opacity-70 uppercase tracking-widest">Suggested</div>}
                                {!isSug && shift.status === "draft" && <div className="text-[8px] sm:text-[9px] font-normal opacity-60 uppercase tracking-widest">Draft</div>}
                                {(shift as any).offerStatus === "offered" && <div className="text-[8px] font-bold text-amber-600 uppercase tracking-widest">Offered</div>}
                              </button>
                            );
                          })}
                          {isManager && !isApprovedLeave && !isBulkSelecting && (
                            <button
                              onClick={() => openCreate(emp.id, dateStr)}
                              className="flex items-center justify-center h-6 w-full opacity-40 md:opacity-0 group-hover:opacity-100 rounded border border-dashed border-border/50 text-muted-foreground hover:border-primary hover:text-primary transition-all text-xs mt-auto"
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

              {/* Unassigned / Open Shifts row — visible to everyone; staff can take, managers can add */}
              <tr className="group bg-muted/20 hover:bg-muted/30 transition-colors">
                <td className="sticky left-0 z-10 bg-muted/40 border-r border-border/50 px-1 sm:px-3 py-2 w-9 sm:w-28">
                  <div className="text-[8px] sm:text-[10px] font-semibold text-muted-foreground font-mono uppercase tracking-wider leading-tight">Open<br className="sm:hidden"/> Shifts</div>
                </td>
                {weekDates.map((d, i) => {
                  const dateStr = format(d, "yyyy-MM-dd");
                  const unassigned = shiftsByEmpAndDate.get(`unassigned:${dateStr}`) || [];
                  return (
                    <td key={i} className="border-r last:border-r-0 border-border/30 align-top p-1">
                      <div className="flex flex-col gap-0.5 min-h-[48px]">
                        {unassigned.map(shift => (
                          <button key={shift.id}
                            onClick={() => isManager
                              ? (selectMode ? toggleShiftSelected(shift.id) : openEdit(shift))
                              : (shift.status === "published" ? setTakeConfirm({ open: true, kind: "unassigned", shift }) : undefined)
                            }
                            className={`relative w-full text-center text-[9px] sm:text-[11px] font-semibold px-1 py-1 rounded border leading-tight transition-all hover:opacity-80 ${getShiftStatusClass(shift.status || "draft")} ${selectMode && selectedIds.has(shift.id) ? "ring-2 ring-primary ring-offset-1" : ""}`}
                          >
                            {selectMode && isManager && (<span className="absolute top-0.5 right-0.5">{selectedIds.has(shift.id) ? <CheckSquare className="w-3 h-3 text-primary" /> : <Square className="w-3 h-3 text-muted-foreground/50" />}</span>)}
                            <div className="leading-snug">{fmtTime(shift.startTime!)}<br className="sm:hidden"/><span className="hidden sm:inline">–</span>{fmtTime(shift.endTime!)}</div>
                            {!isManager && shift.status === "published" && <div className="text-[8px] font-bold text-primary uppercase tracking-widest">Tap to take</div>}
                          </button>
                        ))}
                        {isManager && (
                          <button onClick={() => openCreate(null, dateStr)}
                            className="flex items-center justify-center h-6 w-full opacity-40 md:opacity-0 group-hover:opacity-100 rounded border border-dashed border-border/50 text-muted-foreground hover:border-primary hover:text-primary transition-all text-xs mt-auto">
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {isManager && (
        <p className="text-xs text-muted-foreground text-center">
          Hover a row → <strong>+</strong> to add a shift · Click a shift to edit · <strong>+ bulk preset</strong> under a name to apply a preset to multiple days at once
          {presets.length > 0 && <> · open <strong>Presets</strong> and drag a preset onto a day to add it as a draft</>}
        </p>
      )}

      {/* ── Employee Shift Detail Dialog ── */}
      <Dialog open={!!viewShift} onOpenChange={(v) => !v && setViewShift(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" />Shift Details</DialogTitle>
            {viewShift && (<DialogDescription className="font-mono text-xs">{format(parseISO(viewShift.startTime!.split("T")[0]!), "EEEE, MMMM d, yyyy")}</DialogDescription>)}
          </DialogHeader>
          {viewShift && (() => {
            const wp = workplaces.find(w => w.id === viewShift.workplaceId);
            return (
              <div className="space-y-3 py-1">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                  <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Time</div>
                    <div className="font-bold text-base">{fmtTime(viewShift.startTime!)} – {fmtTime(viewShift.endTime!)}</div>
                  </div>
                </div>
                {wp && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                    <span className="text-lg">📍</span>
                    <div>
                      <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Location</div>
                      <div className="font-semibold">{wp.name}</div>
                      {wp.address && <div className="text-xs text-muted-foreground mt-0.5">{wp.address}</div>}
                    </div>
                  </div>
                )}
                {viewShift.role && (
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                    <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Role</div>
                    <div className="font-semibold mt-0.5">{viewShift.role}</div>
                  </div>
                )}
                {viewShift.notes && (
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                    <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">Notes</div>
                    <p className="text-sm whitespace-pre-wrap">{viewShift.notes}</p>
                  </div>
                )}
                {viewShift.status === "published" && (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={() => { setViewShift(null); setSwapDialog({ open: true, myShiftId: viewShift.id }); loadSwaps(); }}>
                        <ArrowLeftRight className="w-3.5 h-3.5" /> Request Swap
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={() => { setViewShift(null); setOfferDialog({ open: true, shiftId: viewShift.id }); }}>
                        <Gift className="w-3.5 h-3.5" /> Offer Shift
                      </Button>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setViewShift(null); setReplacementDialog({ open: true, shiftId: viewShift.id }); loadReplacements(); }}>
                      <UserCheck className="w-3.5 h-3.5" /> Request a Specific Replacement
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Manager Shift Edit Dialog ── */}
      <Dialog open={modal.open} onOpenChange={(v) => !v && setModal(m => ({ ...m, open: false }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{modal.mode === "create" ? "Add Shift" : "Edit Shift"}</DialogTitle>
            {modal.date && (<DialogDescription className="font-mono text-xs">{format(parseISO(modal.date), "EEEE, MMMM d, yyyy")} · {employees.find(e => e.id === modal.employeeId)?.name ?? "Unassigned"}</DialogDescription>)}
          </DialogHeader>

          {leaveWarning?.hasPending && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-400/30 rounded-lg text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Employee has a <strong className="mx-0.5">{leaveWarning.leaveType}</strong> leave request pending on this date.
            </div>
          )}

          <div className="space-y-4 py-1">
            {/* Presets */}
            {isManager && presets.length > 0 && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Quick Presets</Label>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map(p => (
                    <button key={p.id} onClick={() => applyPreset(p.startTime, p.endTime)}
                      className="px-2.5 py-1 bg-muted hover:bg-primary/10 border border-border/60 hover:border-primary/40 rounded-full text-xs font-semibold transition-all">
                      {p.name} <span className="text-muted-foreground font-mono font-normal">{p.startTime}–{p.endTime}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Time</Label>
                <TimePicker value={formValues.startTime} onChange={v => setFormValues(f => ({ ...f, startTime: v }))} label="Start" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Time</Label>
                <TimePicker value={formValues.endTime} onChange={v => setFormValues(f => ({ ...f, endTime: v }))} label="End" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Workplace</Label>
              <Select value={formValues.workplaceId || "none"} onValueChange={v => setFormValues(f => ({ ...f, workplaceId: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="No workplace assigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No workplace</SelectItem>
                  {workplaces.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role / Position</Label>
              <Input placeholder="e.g. Barista, Cashier" value={formValues.role} onChange={e => setFormValues(f => ({ ...f, role: e.target.value }))} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea placeholder="Any additional notes…" value={formValues.notes} onChange={e => setFormValues(f => ({ ...f, notes: e.target.value }))} className="min-h-[70px] resize-none text-sm" />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {modal.mode === "edit" && modal.shift && (
              <div className="flex gap-2 mr-auto flex-wrap">
                <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}><Trash2 className="w-3.5 h-3.5 mr-1" />{deleting ? "Deleting…" : "Delete"}</Button>
                {modal.shift.status === "published" && (
                  <Button type="button" variant="outline" size="sm" onClick={handleRevertToDraft} disabled={reverting}><RotateCcw className="w-3.5 h-3.5 mr-1" />{reverting ? "Reverting…" : "Draft"}</Button>
                )}
                {modal.shift.status === "draft" && (
                  <Button type="button" variant="outline" size="sm" onClick={handlePublishSingle} disabled={publishingId === modal.shift.id}><Send className="w-3.5 h-3.5 mr-1" />{publishingId === modal.shift.id ? "Publishing…" : "Publish"}</Button>
                )}
              </div>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setModal(m => ({ ...m, open: false }))}>Cancel</Button>
            <Button type="button" size="sm" onClick={handleSubmit} disabled={createShift.isPending || updateShift.isPending} className="font-semibold">
              {createShift.isPending || updateShift.isPending ? "Saving…" : modal.mode === "create" ? "Add Shift" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Swap Request Dialog ── */}
      <Dialog open={swapDialog.open} onOpenChange={v => !v && setSwapDialog({ open: false })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-primary" />Shift Swaps</DialogTitle>
            <DialogDescription>Request a swap with a colleague, or respond to incoming requests.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Pending incoming swaps */}
            {pendingSwapsForMe.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Incoming Requests</p>
                {pendingSwapsForMe.map(sw => {
                  const requester = userMap.get(sw.requesterId);
                  const myShift = shifts.find(s => s.id === sw.targetShiftId);
                  const theirShift = shifts.find(s => s.id === sw.requesterShiftId);
                  return (
                    <div key={sw.id} className="border border-border/50 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-semibold">{requester?.name ?? "Colleague"} wants to swap</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-muted/40 rounded p-2">
                          <div className="text-muted-foreground mb-0.5">Their shift</div>
                          <div className="font-semibold">{theirShift ? fmtTime(theirShift.startTime!) + "–" + fmtTime(theirShift.endTime!) : "?"}</div>
                          <div className="text-muted-foreground font-mono">{theirShift?.startTime?.split("T")[0]}</div>
                        </div>
                        <div className="bg-muted/40 rounded p-2">
                          <div className="text-muted-foreground mb-0.5">Your shift</div>
                          <div className="font-semibold">{myShift ? fmtTime(myShift.startTime!) + "–" + fmtTime(myShift.endTime!) : "?"}</div>
                          <div className="text-muted-foreground font-mono">{myShift?.startTime?.split("T")[0]}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleRespondSwap(sw.id, "accept")}>✓ Accept</Button>
                        <Button size="sm" variant="outline" className="flex-1 gap-1 text-red-500 hover:text-red-600" onClick={() => handleRespondSwap(sw.id, "reject")}>✕ Decline</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* New swap request */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Request New Swap</p>
              <div className="space-y-2">
                <Label className="text-xs">Your shift to swap away</Label>
                <Select value={swapDialog.myShiftId ? String(swapDialog.myShiftId) : ""} onValueChange={v => setSwapDialog(d => ({ ...d, myShiftId: parseInt(v) }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select your shift" /></SelectTrigger>
                  <SelectContent>
                    {myPublishedShifts.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {format(new Date(s.startTime!), "EEE MMM d")} · {fmtTime(s.startTime!)}–{fmtTime(s.endTime!)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Colleague's shift you want</Label>
                <Select value={swapTargetShiftId} onValueChange={setSwapTargetShiftId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select their shift" /></SelectTrigger>
                  <SelectContent>
                    {otherPublishedShifts.map(s => {
                      const emp = userMap.get(s.employeeId!);
                      return (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {emp?.name} · {format(new Date(s.startTime!), "EEE MMM d")} · {fmtTime(s.startTime!)}–{fmtTime(s.endTime!)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSwapDialog({ open: false })}>Close</Button>
            <Button size="sm" onClick={handleSendSwap} disabled={!swapDialog.myShiftId || !swapTargetShiftId || sendingSwap} className="font-semibold gap-1.5">
              <ArrowLeftRight className="w-3.5 h-3.5" />{sendingSwap ? "Sending..." : "Send Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Shift Replacement Dialog ── */}
      <Dialog open={replacementDialog.open} onOpenChange={v => !v && setReplacementDialog({ open: false })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCheck className="w-4 h-4 text-primary" />Shift Replacements</DialogTitle>
            <DialogDescription>Ask a specific colleague to cover your shift, or respond to incoming requests.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Pending incoming replacement requests */}
            {pendingReplacementsForMe.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Incoming Requests</p>
                {pendingReplacementsForMe.map(r => {
                  const requester = userMap.get(r.requestedBy);
                  const shift = shiftsById.get(r.shiftId);
                  return (
                    <div key={r.id} className="border border-border/50 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-semibold">{requester?.name ?? "A colleague"} wants you to cover their shift</p>
                      <div className="bg-muted/40 rounded p-2 text-xs">
                        <div className="font-semibold">{shift ? `${fmtTime(shift.startTime!)}–${fmtTime(shift.endTime!)}` : "?"}</div>
                        <div className="text-muted-foreground font-mono">{shift?.startTime?.split("T")[0]}</div>
                        {shift?.role && <div className="text-muted-foreground mt-0.5">{shift.role}</div>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleRespondReplacement(r.id, "accept")}>✓ Accept</Button>
                        <Button size="sm" variant="outline" className="flex-1 gap-1 text-red-500 hover:text-red-600" onClick={() => handleRespondReplacement(r.id, "reject")}>✕ Decline</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* New replacement request */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Request a Replacement</p>
              <div className="space-y-2">
                <Label className="text-xs">Your shift to hand off</Label>
                <Select value={replacementDialog.shiftId ? String(replacementDialog.shiftId) : ""} onValueChange={v => setReplacementDialog(d => ({ ...d, shiftId: parseInt(v) }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select your shift" /></SelectTrigger>
                  <SelectContent>
                    {myPublishedShifts.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {format(new Date(s.startTime!), "EEE MMM d")} · {fmtTime(s.startTime!)}–{fmtTime(s.endTime!)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Colleague to cover it</Label>
                <Select value={replacementTargetId} onValueChange={setReplacementTargetId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Choose a staff member" /></SelectTrigger>
                  <SelectContent>
                    {replacementCandidates.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setReplacementDialog({ open: false })}>Close</Button>
            <Button size="sm" onClick={handleSendReplacement} disabled={!replacementDialog.shiftId || !replacementTargetId || sendingReplacement} className="font-semibold gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />{sendingReplacement ? "Sending..." : "Send Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Offer Shift Dialog ── */}
      <Dialog open={offerDialog.open} onOpenChange={v => !v && setOfferDialog({ open: false })}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Gift className="w-4 h-4 text-primary" />Offer Your Shift</DialogTitle>
            <DialogDescription>Make this shift available for any colleague to pick up. Everyone will be notified.</DialogDescription>
          </DialogHeader>
          {offerDialog.shiftId && (() => {
            const shift = shifts.find(s => s.id === offerDialog.shiftId);
            return shift ? (
              <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-sm">
                <div className="font-bold">{fmtTime(shift.startTime!)} – {fmtTime(shift.endTime!)}</div>
                <div className="text-muted-foreground font-mono text-xs mt-0.5">{shift.startTime?.split("T")[0]}</div>
                {shift.role && <div className="text-xs mt-1 text-muted-foreground">{shift.role}</div>}
              </div>
            ) : null;
          })()}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOfferDialog({ open: false })}>Cancel</Button>
            <Button size="sm" onClick={handleOfferShift} disabled={offerLoading} className="font-semibold gap-1.5">
              <Gift className="w-3.5 h-3.5" />{offerLoading ? "Offering..." : "Offer Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Take Shift Confirmation ── */}
      <Dialog open={!!takeConfirm?.open} onOpenChange={v => !v && setTakeConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HandCoins className="w-4 h-4 text-primary" />Take This Shift?</DialogTitle>
            <DialogDescription>This will assign the shift to you immediately. Make sure you're available.</DialogDescription>
          </DialogHeader>
          {takeConfirm?.shift && (
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-sm">
              <div className="font-bold">{format(new Date(takeConfirm.shift.startTime!), "EEEE, MMM d")} · {fmtTime(takeConfirm.shift.startTime!)} – {fmtTime(takeConfirm.shift.endTime!)}</div>
              {takeConfirm.shift.role && <div className="text-xs mt-1 text-muted-foreground">{takeConfirm.shift.role}</div>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setTakeConfirm(null)}>Cancel</Button>
            <Button size="sm" onClick={handleConfirmTake} disabled={takingShift} className="font-semibold gap-1.5">
              <HandCoins className="w-3.5 h-3.5" />{takingShift ? "Taking..." : "Yes, Take Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CSV Import Dialog ── */}
      <Dialog open={csvImportDialog} onOpenChange={v => { if (!v) { setCsvImportDialog(false); setCsvPreview([]); setCsvErrors([]); if (csvInputRef.current) csvInputRef.current.value = ""; } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-primary" />Import Roster from CSV</DialogTitle>
            <DialogDescription>Download the template, fill it in, then upload to import shifts as drafts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Month</Label>
                <Select value={String(csvMonth)} onValueChange={v => { setCsvMonth(parseInt(v)); setCsvPreview([]); setCsvErrors([]); }}>
                  <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => (
                      <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Year</Label>
                <Input type="number" value={csvYear} onChange={e => { setCsvYear(parseInt(e.target.value)); setCsvPreview([]); setCsvErrors([]); }} className="h-8 w-24 text-xs" />
              </div>
              <Button size="sm" variant="outline" className="mt-5 gap-1.5 text-xs" onClick={handleCsvTemplate}>
                <Download className="w-3.5 h-3.5" /> Template
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Upload CSV</Label>
              <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvFileChange} className="text-xs" />
            </div>
            {csvErrors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-600">Warnings ({csvErrors.length})</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                  {csvErrors.map((e, i) => <li key={i}>⚠ {e}</li>)}
                </ul>
              </div>
            )}
            {csvPreview.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-emerald-600">{csvPreview.length} shift{csvPreview.length !== 1 ? "s" : ""} ready to import</p>
                <div className="max-h-36 overflow-y-auto border border-border/40 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40"><tr><th className="text-left px-2 py-1">Employee</th><th className="text-left px-2 py-1">Date</th><th className="text-left px-2 py-1">Time</th><th className="text-left px-2 py-1">Role</th></tr></thead>
                    <tbody className="divide-y divide-border/30">
                      {csvPreview.slice(0, 20).map((r, i) => (
                        <tr key={i}><td className="px-2 py-1">{r.employeeName}</td><td className="px-2 py-1 font-mono">{r.dateStr}</td><td className="px-2 py-1 font-mono">{r.startTime.split("T")[1]?.slice(0,5)}–{r.endTime.split("T")[1]?.slice(0,5)}</td><td className="px-2 py-1 text-muted-foreground">{r.role ?? "—"}</td></tr>
                      ))}
                      {csvPreview.length > 20 && <tr><td colSpan={4} className="px-2 py-1 text-center text-muted-foreground italic">…and {csvPreview.length - 20} more</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCsvImportDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCsvImport} disabled={csvPreview.length === 0 || csvImporting} className="font-semibold gap-1.5">
              <Upload className="w-3.5 h-3.5" />{csvImporting ? "Importing..." : `Import ${csvPreview.length} Shift${csvPreview.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
