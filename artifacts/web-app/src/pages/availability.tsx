import { useAuth } from "@/hooks/use-auth";
import {
  useListAvailability, useCreateAvailability, useUpdateAvailability,
  useListUsers,
  getListAvailabilityQueryKey, getListUsersQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarCheck, Save } from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
    a => a.weekStart === weekStartStr && (!isManager || a.employeeId === user?.id)
  );

  const currentSlots = existing?.slots
    ? (existing.slots as Record<string, boolean>)
    : Object.fromEntries(weekDates.map(d => [format(d, "yyyy-MM-dd"), false]));

  const [editSlots, setEditSlots] = useState<Record<string, boolean>>(currentSlots);
  const [isDirty, setIsDirty] = useState(false);

  function handleWeekChange(next: Date) {
    setCurrentWeek(next);
    setIsDirty(false);
  }

  function toggle(dateStr: string) {
    setEditSlots(s => ({ ...s, [dateStr]: !s[dateStr] }));
    setIsDirty(true);
  }

  async function handleSave() {
    if (!user) return;
    try {
      if (existing) {
        await updateAvail.mutateAsync({ id: existing.id, data: { weekStart: weekStartStr, slots: editSlots } });
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
    const found = allUsers.find(u => u.id === employeeId);
    return found ? found.name : `Employee #${employeeId}`;
  }

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

      {/* Employee self-edit view */}
      {!isManager && (
        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Your Availability</CardTitle>
            </div>
            <CardDescription>Tick the days you're available to work this week. This will show in the roster.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-2 mb-6">
                  {weekDates.map((d, i) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const isAvailable = editSlots[dateStr] ?? false;
                    const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;
                    return (
                      <button
                        key={dateStr}
                        onClick={() => toggle(dateStr)}
                        className={`flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${isAvailable
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-sm'
                          : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/60'
                          } ${isToday ? 'ring-2 ring-emerald-500/30' : ''}`}
                      >
                        <span className="text-xs font-semibold uppercase tracking-wider">{DAY_LABELS[i]}</span>
                        <span className="text-lg sm:text-xl font-bold mt-1">{format(d, 'd')}</span>
                        <span className={`text-[10px] mt-1 font-mono ${isAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/50'}`}>
                          {isAvailable ? '✓' : '–'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Tap a day to toggle your availability.</p>
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

      {/* Manager view: own availability + team overview */}
      {isManager && (
        <>
          <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Your Availability</CardTitle>
              </div>
              <CardDescription>Set your own availability for this week.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-2 mb-4">
                    {weekDates.map((d, i) => {
                      const dateStr = format(d, "yyyy-MM-dd");
                      const isAvailable = editSlots[dateStr] ?? false;
                      const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;
                      return (
                        <button
                          key={dateStr}
                          onClick={() => toggle(dateStr)}
                          className={`flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl border-2 transition-all cursor-pointer select-none ${isAvailable
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-sm'
                            : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/60'
                            } ${isToday ? 'ring-2 ring-emerald-500/30' : ''}`}
                        >
                          <span className="text-xs font-semibold uppercase tracking-wider">{DAY_LABELS[i]}</span>
                          <span className="text-base sm:text-lg font-bold mt-1">{format(d, 'd')}</span>
                          <span className={`text-[10px] mt-1 font-mono ${isAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/50'}`}>
                            {isAvailable ? '✓' : '–'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={!isDirty || createAvail.isPending || updateAvail.isPending} size="sm" className="font-semibold">
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      {createAvail.isPending || updateAvail.isPending ? "Saving..." : "Save My Availability"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

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
                          <td className="py-2 pr-4 font-medium text-sm">
                            {getEmployeeName(avail.employeeId)}
                          </td>
                          {weekDates.map((d, i) => {
                            const dateStr = format(d, "yyyy-MM-dd");
                            const isAvail = (avail.slots as any)?.[dateStr] === true;
                            return (
                              <td key={i} className="py-2 px-1 text-center">
                                <div className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center text-xs font-semibold ${isAvail ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                                  {isAvail ? '✓' : '–'}
                                </div>
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
        </>
      )}
    </div>
  );
}
