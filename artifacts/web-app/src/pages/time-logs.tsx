import { useAuth } from "@/hooks/use-auth";
import { useListTimeLogs, useClockIn, useClockOut, useListUsers , getListUsersQueryKey, getListTimeLogsQueryKey} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { format, formatDistanceStrict } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Play, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TimeLogsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: logs = [], isLoading } = useListTimeLogs({ query: { enabled: !!user , queryKey: getListTimeLogsQueryKey() } });
  const { data: users = [] } = useListUsers({ query: { enabled: !!user && user.role !== 'employee' , queryKey: getListUsersQueryKey() } });
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
    if (!activeLog) return; clockOut.mutate({ id: activeLog.id, data: { actualOut: new Date().toISOString(), locationValid: true } }, {
      onSuccess: () => {
        toast({ title: "Clocked out successfully" });
        queryClient.invalidateQueries({ queryKey: ['/api/time-logs'] });
      }
    });
  };

  const activeLog = logs.find(l => l.employeeId === user?.id && !l.actualOut);
  const filteredLogs = user?.role === 'employee' ? logs.filter(l => l.employeeId === user.id) : logs;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold font-sans tracking-tight text-foreground">Time Tracking</h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">Clock in and out</p>
        </div>
      </div>

      <Card className="border-primary shadow-lg bg-card/80 backdrop-blur border-t-4">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-inner ${activeLog ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                <Clock size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-bold">{activeLog ? "Currently Clocked In" : "Not Clocked In"}</h3>
                {activeLog && (
                  <p className="text-muted-foreground font-mono mt-1">
                    Since {format(new Date(activeLog.actualIn), 'h:mm a')} 
                    ({formatDistanceStrict(new Date(activeLog.actualIn), new Date())} ago)
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex gap-4">
              {!activeLog ? (
                <Button size="lg" className="w-40 font-bold tracking-wide" onClick={handleClockIn} disabled={clockIn.isPending}>
                  <Play className="mr-2 h-5 w-5" /> Clock In
                </Button>
              ) : (
                <Button size="lg" variant="destructive" className="w-40 font-bold tracking-wide" onClick={handleClockOut} disabled={clockOut.isPending}>
                  <Square className="mr-2 h-5 w-5" /> Clock Out
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Recent Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  {user?.role !== 'employee' && <TableHead className="font-mono text-xs uppercase tracking-wider">Employee</TableHead>}
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Date</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Clock In</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Clock Out</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No time logs found.</TableCell></TableRow>
                ) : (
                  filteredLogs.map((log) => {
                    const employee = users.find(u => u.id === log.employeeId);
                    const duration = log.actualOut ? formatDistanceStrict(new Date(log.actualIn), new Date(log.actualOut)) : '-';
                    return (
                      <TableRow key={log.id} className="hover:bg-muted/30">
                        {user?.role !== 'employee' && (
                          <TableCell className="font-medium">
                            {employee?.name || `User #${log.employeeId}`}
                          </TableCell>
                        )}
                        <TableCell>{format(new Date(log.actualIn), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="font-mono text-sm">{format(new Date(log.actualIn), 'h:mm a')}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.actualOut ? format(new Date(log.actualOut), 'h:mm a') : <span className="text-accent animate-pulse">Active</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{duration}</TableCell>
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
