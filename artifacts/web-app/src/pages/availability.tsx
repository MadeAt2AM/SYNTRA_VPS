import { useAuth } from "@/hooks/use-auth";
import {
  useListAvailability, useCreateAvailability, useUpdateAvailability,
  useListUsers,
  getListAvailabilityQueryKey, getListUsersQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarCheck, Save } from "lucide-react";
import { TimePicker } from "@/components/ui/time-picker";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Slot value types:
// false / undefined             → not set
// true                          → available all day (legacy)
// { available: true, startTime?, endTime? } → available with optional hours
// { unavailable: true }         → explicitly unavailable

type SlotValue = boolean | { available: true; startTime?: string; endTime?: string } | { unavailable: true };

function isAvailable(v: SlotValue | undefined): boolean {
  if (!v) return false;
  if (v === true) return true;
  if (typeof v === "object" && "available" in v) return true;
  return false;
}

function isUnavailable(v: SlotValue | undefined): boolean {
  if (!v || v === true) return false;
  if (typeof v === "object" && "unavailable" in v) return true;
  return false;
}

function getTimeRange(v: SlotValue | undefined): { startTime: string; endTime: string } {
  if (typeof v === "object" && v !== null && "available" in v) {
    return { startTime: v.startTime ?? "", endTime: v.endTime ?? "" };
  }
  return { startTime: "", endTime: "" };
}

function getWeekDates(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export default function AvailabilityPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekDates = getWeekDates(currentWeek);
  const weekStartStr = format(currentWeek, "yyyy-MM-dd");

  const { data: availabilityList = [], isLoading } = useListAvailability({
    query: { enabled: !!user, queryKey: getListAvailabilityQueryKey() }
  });

  const { data: allUsers = [] } = useListUsers({
    query: { enabled: !!user && (user.role === "admin" || user.role === "manager"), queryKey: getListUsersQueryKey() }
  });

  const createAvail = useCreateAvailability();
  const updateAvail = useUpdateAvailability();

  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const existing = availabilityList.find(
    a => a.weekStart === weekStartStr && a.employeeId === user?.id
  );

  const rawSlots = existing?.slots as Record<string, SlotValue> | null;
  const initSlots: Record<string, SlotValue> = Object.fromEntries(
    weekDates.map(d => [format(d, "yyyy-MM-dd"), rawSlots?.[format(d, "yyyy-MM-dd")] ?? false])
  );

  const [editSlots, setEditSlots] = useState<Record<string, SlotValue>>(initSlots);
  const [isDirty, setIsDirty] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  function handleWeekChange(next: Date) {
    setCurrentWeek(next);
    setIsDirty(false);
    setExpandedDay(null);
    // Reset slots to new week's data
    const newRaw = availabilityList.find(a => a.weekStart === format(next, "yyyy-MM-dd") && a.employeeId === user?.id)?.slots as Record<string, SlotValue> | null;
    const newDates = getWeekDates(next);
    setEditSlots(Object.fromEntries(
      newDates.map(d => [format(d, "yyyy-MM-dd"), newRaw?.[format(d, "yyyy-MM-dd")] ?? false])
    ));
  }

  function toggleAvailable(dateStr: string) {
    setEditSlots(s => {
      const cur = s[dateStr];
      if (isAvailable(cur)) {
        // Was available → clear
        return { ...s, [dateStr]: false };
      } else {
        // Set available
        return { ...s, [dateStr]: { available: true } };
      }
    });
    setIsDirty(true);
  }

  function toggleUnavailable(dateStr: string) {
    setEditSlots(s => {
      const cur = s[dateStr];
      if (isUnavailable(cur)) {
        return { ...s, [dateStr]: false };
      } else {
        return { ...s, [dateStr]: { unavailable: true } };
      }
    });
    setIsDirty(true);
  }

  function setTimeRange(dateStr: string, field: "startTime" | "endTime", value: string) {
    setEditSlots(s => {
      const cur = s[dateStr];
      const existing = (typeof cur === "object" && cur !== null && "available" in cur)
        ? cur
        : { available: true as const };
      return { ...s, [dateStr]: { ...existing, [field]: value } };
    });
    setIsDirty(true);
  }

  async function handleSave() {
    if (!user) return;
    const existingForWeek = availabilityList.find(a => a.weekStart === weekStartStr && a.employeeId === user.id);
    try {
      if (existingForWeek) {
        await updateAvail.mutateAsync({ id: existingForWeek.id, data: { weekStart: weekStartStr, slots: editSlots } });
      } else {
        await createAvail.mutateAsync({ data: { weekStart: weekStartStr, slots: editSlots } });
      }
      queryClient.invalidateQueries({ queryKey: getListAvailabilityQueryKey() });
      toast({ title: "Availability saved", description: `Week of ${format(currentWeek, 'MMM d, yyyy')} updated.` });
      setIsDirty(false);
    } catch {
      toast({ title: "Error saving availability", variant: "destructive" });
    }
  }

  const myAvail = availabilityList.filter(a => a.weekStart === weekStartStr);

  function getEmployeeName(employeeId: number): string {
    return allUsers.find(u => u.id === employeeId)?.name ?? `Employee #${employeeId}`;
  }

  const DayGrid = ({ dates }: { dates: Date[] }) => (
    <div className="space-y-2">
      {dates.map((d, i) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const slotVal = editSlots[dateStr];
        const avail = isAvailable(slotVal);
        const unavail = isUnavailable(slotVal);
        const { startTime, endTime } = getTimeRange(slotVal);
        const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;
        const isExpanded = expandedDay === dateStr;

        return (
          <div key={dateStr} className={`rounded-xl border-2 transition-all ${avail
            ? 'border-emerald-500 bg-emerald-500/8'
            : unavail
              ? 'border-red-400 bg-red-500/8'
              : 'border-border/50 bg-muted/20'
            } ${isToday ? 'ring-2 ring-primary/30' : ''}`}>
            <div className="flex items-center gap-3 p-3">
              {/* Day label */}
              <div className="w-16 flex-shrink-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{DAY_LABELS[i]}</div>
                <div className="text-lg font-bold leading-none mt-0.5">{format(d, 'd')}</div>
              </div>

              {/* Status buttons */}
              <div className="flex gap-2 flex-1">
                <button
                  onClick={() => { toggleAvailable(dateStr); if (!avail) setExpandedDay(dateStr); else setExpandedDay(null); }}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all border ${avail
                    ? 'bg-emerald-500 text-white border-emerald-600'
                    : 'bg-muted/40 text-muted-foreground border-border/50 hover:border-emerald-400 hover:text-emerald-600'
                    }`}
                >
                  ✓ Available
                </button>
                <button
                  onClick={() => { toggleUnavailable(dateStr); setExpandedDay(null); }}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all border ${unavail
                    ? 'bg-red-500 text-white border-red-600'
                    : 'bg-muted/40 text-muted-foreground border-border/50 hover:border-red-400 hover:text-red-600'
                    }`}
                >
                  ✕ Unavailable
                </button>
              </div>

              {/* Expand time input */}
              {avail && (
                <button
                  onClick={() => setExpandedDay(isExpanded ? null : dateStr)}
                  className="text-[11px] text-primary font-semibold hover:underline flex-shrink-0"
                >
                  {startTime ? `${startTime}–${endTime || "?"}` : "+ Times"}
                </button>
              )}
            </div>

            {/* Time range input (expanded) */}
            {avail && isExpanded && (
              <div className="px-3 pb-3 flex flex-wrap items-center gap-2 border-t border-emerald-500/20 pt-2">
                <label className="text-xs text-muted-foreground font-semibold w-10">From</label>
                <TimePicker
                  value={startTime || "09:00"}
                  onChange={v => setTimeRange(dateStr, "startTime", v)}
                  className="h-7 w-28 text-xs"
                  label="From"
                />
                <label className="text-xs text-muted-foreground font-semibold">To</label>
                <TimePicker
                  value={endTime || "17:00"}
                  onChange={v => setTimeRange(dateStr, "endTime", v)}
                  className="h-7 w-28 text-xs"
                  label="To"
                />
                <span className="text-[10px] text-muted-foreground italic">optional</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold font-sans tracking-tight">Availability</h1>
          <p className="text-muted-foreground mt-1 font-mono text-xs uppercase tracking-widest">
            {isManager ? "Team availability overview" : "Set your available days"}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-card rounded-md border shadow-sm p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleWeekChange(subWeeks(currentWeek, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-3 font-semibold text-sm whitespace-nowrap">
            {format(currentWeek, 'MMM d')} – {format(addDays(currentWeek, 6), 'MMM d, yyyy')}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleWeekChange(addWeeks(currentWeek, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500/50" /> Available</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/30 border border-red-400/50" /> Unavailable</span>
      </div>

      {/* My availability editor — not shown to admin (owner account, not a scheduled employee) */}
      {user?.role !== 'admin' && (
        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Your Availability</CardTitle>
            </div>
            <CardDescription>
              Mark each day as available (with optional hours) or unavailable. Both will show on the roster.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              <>
                <DayGrid dates={weekDates} />
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-muted-foreground">
                    Available days show green · Unavailable show red in the roster.
                  </p>
                  <Button onClick={handleSave} disabled={!isDirty || createAvail.isPending || updateAvail.isPending} size="sm" className="font-semibold">
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {createAvail.isPending || updateAvail.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manager: team overview */}
      {isManager && (
        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">Team Availability This Week</CardTitle>
            <CardDescription>Staff-submitted availability for the selected week.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : myAvail.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No availability submitted for this week.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 pr-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-36">Employee</th>
                      {weekDates.map((d, i) => (
                        <th key={i} className="text-center py-2 px-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                          <div>{DAY_LABELS[i]}</div>
                          <div className="font-normal text-[10px]">{format(d, 'd')}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {myAvail.map(avail => (
                      <tr key={avail.id} className="hover:bg-muted/20">
                        <td className="py-2 pr-4 font-medium text-sm">{getEmployeeName(avail.employeeId)}</td>
                        {weekDates.map((d, i) => {
                          const dateStr = format(d, "yyyy-MM-dd");
                          const sv = (avail.slots as any)?.[dateStr] as SlotValue | undefined;
                          const avl = isAvailable(sv);
                          const unav = isUnavailable(sv);
                          const { startTime, endTime } = getTimeRange(sv);
                          return (
                            <td key={i} className="py-2 px-1 text-center">
                              {avl ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-semibold">✓</div>
                                  {startTime && <span className="text-[9px] text-muted-foreground font-mono">{startTime}{endTime ? `–${endTime}` : ""}</span>}
                                </div>
                              ) : unav ? (
                                <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center text-xs font-semibold mx-auto">✕</div>
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs mx-auto">–</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
