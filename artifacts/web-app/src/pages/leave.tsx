import { useAuth } from "@/hooks/use-auth";
import { useListLeaveRequests, useCreateLeaveRequest, useUpdateLeaveRequest, useListUsers , getListUsersQueryKey, getListLeaveRequestsQueryKey} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Briefcase, Plus, Check, X, RotateCcw } from "lucide-react";

const leaveSchema = z.object({
  startDate: z.string().min(1, "Required"),
  endDate: z.string().min(1, "Required"),
  type: z.enum(['annual', 'sick', 'unpaid', 'other']),
  reason: z.string().optional()
});

export default function LeavePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: requests = [], isLoading } = useListLeaveRequests({ query: { enabled: !!user , queryKey: getListLeaveRequestsQueryKey() } });
  const { data: users = [] } = useListUsers({ query: { enabled: !!user && user.role !== 'employee' , queryKey: getListUsersQueryKey() } });
  const createRequest = useCreateLeaveRequest();
  const updateRequest = useUpdateLeaveRequest();
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof leaveSchema>>({
    resolver: zodResolver(leaveSchema),
    defaultValues: { type: 'annual', reason: '' }
  });

  function onSubmit(values: z.infer<typeof leaveSchema>) {
    createRequest.mutate({ data: values }, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });
      }
    });
  }

  const handleStatusUpdate = (id: number, status: 'approved' | 'rejected' | 'pending') => {
    updateRequest.mutate({ id, data: { status } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() })
    });
  };

  const filteredRequests = (user?.role === 'employee'
    ? requests.filter(r => r.employeeId === user.id)
    : requests
  ).slice().sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold font-sans tracking-tight text-foreground">Leave Requests</h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">Time off management</p>
        </div>
        {user?.role !== 'admin' && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-semibold"><Plus className="w-4 h-4 mr-2" /> Request Time Off</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Leave</DialogTitle>
              <DialogDescription>Submit a new time-off request.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="annual">Annual Leave</SelectItem>
                          <SelectItem value="sick">Sick Leave</SelectItem>
                          <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Details..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createRequest.isPending}>
                    {createRequest.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" />
            <CardTitle>History</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  {user?.role !== 'employee' && <TableHead className="font-mono text-xs uppercase tracking-wider">Employee</TableHead>}
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Dates</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Type</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Status</TableHead>
                  {user?.role !== 'employee' && <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filteredRequests.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No leave requests found.</TableCell></TableRow>
                ) : (
                  filteredRequests.map((req) => {
                    const employee = users.find(u => u.id === req.employeeId);
                    return (
                      <TableRow key={req.id} className="hover:bg-muted/30">
                        {user?.role !== 'employee' && (
                          <TableCell className="font-medium">
                            {employee?.name || `User #${req.employeeId}`}
                          </TableCell>
                        )}
                        <TableCell className="text-sm">
                          {format(new Date(req.startDate), 'MMM d, yyyy')} - {format(new Date(req.endDate), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <span className="capitalize text-sm">{req.type}</span>
                          {req.reason && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{req.reason}</p>}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs font-mono border 
                            ${req.status === 'approved' ? 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400' : 
                              req.status === 'rejected' ? 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400' : 
                              'bg-accent/10 text-accent-foreground border-accent/20'}`}>
                            {req.status}
                          </span>
                        </TableCell>
                        {user?.role !== 'employee' && (
                          <TableCell className="text-right">
                            {req.status === 'pending' ? (
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-green-600" onClick={() => handleStatusUpdate(req.id, 'approved')}>
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive" onClick={() => handleStatusUpdate(req.id, 'rejected')}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground gap-1 hover:text-foreground" onClick={() => handleStatusUpdate(req.id, 'pending')}>
                                <RotateCcw className="w-3 h-3" />
                                Revert
                              </Button>
                            )}
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
