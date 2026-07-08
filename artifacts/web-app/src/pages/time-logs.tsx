import { useAuth } from "@/hooks/use-auth";
import { useListTimeLogs, useClockIn, useClockOut, useListUsers, getListUsersQueryKey, getListTimeLogsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, formatDistanceStrict } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Play, Square, Download, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function TimeLogsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [exportPeriod, setExportPeriod] = useState<"week" | "month">("month");
  const [exporting, setExporting] = useState(false);
  const [settling, setSettling] = useState(false);

  const { data: logs = [], isLoading } = useListTimeLogs({ query: { enabled: !!user, queryKey: getListTimeLogsQueryKey() } });
  const { data: users = [] } = useListUsers({ query: { enabled: !!user && user.role !== 'employee', queryKey: getListUsersQueryKey() } });
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const handleClockIn = () => {
    clockIn.mutate({ data: { locationValid: true } }, {
      onSuccess: () => {
        toast({ title: "Clocked in successfully" });
        queryClient.invalidateQueries({ queryKey: ['/api/time-logs'] });
      }
    });
  };

  const handleClockOut = () => {
    if (!activeLog) return;
    clockOut.mutate({ id: activeLog.id, data: { actualOut: new Date().toISOString(), locationValid: true } }, {
      onSuccess: () => {
        toast({ title: "Clocked out successfully" });
        queryClient.invalidateQueries({ queryKey: ['/api/time-logs'] });
      }
    });
  };

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

  const activeLog = logs.find(l => l.employeeId === user?.id && !l.actualOut);
  const filteredLogs = user?.role === 'employee' ? logs.filter(l => l.employeeId === user.id) : logs;
  const isManager = user?.role === 'admin' || user?.role === 'manager';

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
              </div>
            </div>
            <div>
              {!activeLog ? (
                <Button size="lg" className="w-36 font-bold" onClick={handleClockIn} disabled={clockIn.isPending}>
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
                  {isManager && <TableHead className="font-mono text-xs uppercase tracking-wider">Paid</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No time logs found.</TableCell></TableRow>
                ) : (
                  filteredLogs.slice().reverse().map(log => {
                    const emp = users.find(u => u.id === log.employeeId);
                    const duration = log.actualOut ? formatDistanceStrict(new Date(log.actualIn), new Date(log.actualOut)) : '-';
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
    </div>
  );
}
