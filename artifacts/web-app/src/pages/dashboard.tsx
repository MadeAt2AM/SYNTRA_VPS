import { useAuth } from "@/hooks/use-auth";
import { useListUsers, useListLeaveRequests, useListTimeLogs, useListShifts , getListUsersQueryKey, getListLeaveRequestsQueryKey, getListTimeLogsQueryKey, getListShiftsQueryKey} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, isToday } from "date-fns";
import { Users, Clock, CalendarDays, AlertCircle } from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  
  const { data: users = [] } = useListUsers({ query: { enabled: !!user && user.role !== 'employee' , queryKey: getListUsersQueryKey() } });
  const { data: leaveRequests = [] } = useListLeaveRequests({ query: { enabled: !!user , queryKey: getListLeaveRequestsQueryKey() } });
  const { data: timeLogs = [] } = useListTimeLogs({ query: { enabled: !!user , queryKey: getListTimeLogsQueryKey() } });
  const { data: shifts = [] } = useListShifts({ query: { enabled: !!user , queryKey: getListShiftsQueryKey() } });

  const role = user?.role;

  const todayShifts = shifts.filter(s => isToday(new Date(s.startTime)));
  const pendingLeave = leaveRequests.filter(l => l.status === 'pending');
  const activeTimeLogs = timeLogs.filter(t => !t.actualOut);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold font-sans tracking-tight text-foreground">
            Welcome back, {user?.name.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">
            {format(new Date(), 'EEEE, MMMM do, yyyy')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(role === 'admin' || role === 'manager') && (
          <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Total Staff</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{users.length}</div>
              <p className="text-xs text-muted-foreground mt-1 text-primary font-medium">
                {users.filter(u => u.status === 'active').length} active
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Today's Shifts</CardTitle>
            <CalendarDays className="h-4 w-4 text-accent" />
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
            <Clock className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{role === 'employee' ? (activeTimeLogs.some(t => t.employeeId === user?.id) ? '1' : '0') : activeTimeLogs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {role === 'employee' ? (activeTimeLogs.some(t => t.employeeId === user?.id) ? 'You are clocked in' : 'You are clocked out') : 'Staff currently working'}
            </p>
          </CardContent>
        </Card>
      </div>

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
                  <div key={shift.id} className="flex items-center justify-between p-4 bg-card rounded-lg border border-border shadow-sm hover-elevate transition-all">
                    <div>
                      <p className="font-semibold">{format(new Date(shift.startTime), 'h:mm a')} - {format(new Date(shift.endTime), 'h:mm a')}</p>
                      {role !== 'employee' && employee && (
                        <p className="text-sm text-muted-foreground">{employee.name} • {shift.role || 'Staff'}</p>
                      )}
                    </div>
                    <div className="text-right text-sm font-mono bg-background px-3 py-1 rounded border border-border/50">
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
                      <div className="w-2 h-2 rounded-full bg-accent"></div>
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
