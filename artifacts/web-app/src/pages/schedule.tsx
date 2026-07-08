import { useAuth } from "@/hooks/use-auth";
import { useListShifts, useCreateShift, useUpdateShift, useDeleteShift, useListUsers, useListWorkplaces , getListUsersQueryKey, getListShiftsQueryKey, getListWorkplacesQueryKey} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, startOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { CalendarDays, Plus, ChevronLeft, ChevronRight, MapPin, User, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const shiftSchema = z.object({
  employeeId: z.coerce.number().optional().nullable(),
  workplaceId: z.coerce.number().optional().nullable(),
  startTimeDate: z.string().min(1, "Date required"),
  startTimeTime: z.string().min(1, "Time required"),
  endTimeDate: z.string().min(1, "Date required"),
  endTimeTime: z.string().min(1, "Time required"),
  role: z.string().optional(),
  status: z.enum(['draft', 'published', 'cancelled']).default('published'),
});

export default function SchedulePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [open, setOpen] = useState(false);

  const { data: shifts = [] } = useListShifts({ query: { enabled: !!user , queryKey: getListShiftsQueryKey() } });
  const { data: users = [] } = useListUsers({ query: { enabled: !!user && user.role !== 'employee' , queryKey: getListUsersQueryKey() } });
  const { data: workplaces = [] } = useListWorkplaces({ query: { enabled: !!user && user.role !== 'employee' , queryKey: getListWorkplacesQueryKey() } });
  
  const createShift = useCreateShift();
  const updateShift = useUpdateShift();
  const deleteShift = useDeleteShift();

  const form = useForm<z.infer<typeof shiftSchema>>({
    resolver: zodResolver(shiftSchema),
    defaultValues: { status: 'published', role: '' },
  });

  function onSubmit(values: z.infer<typeof shiftSchema>) {
    // combine date and time into ISO
    const start = new Date(`${values.startTimeDate}T${values.startTimeTime}`);
    const end = new Date(`${values.endTimeDate}T${values.endTimeTime}`);

    const payload = {
      employeeId: values.employeeId || null,
      workplaceId: values.workplaceId || null,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      role: values.role,
      status: values.status,
    };

    createShift.mutate({ data: payload }, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        toast({ title: "Shift created" });
      }
    });
  }

  const handleDelete = (id: number) => {
    if (confirm("Delete this shift?")) {
      deleteShift.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
        }
      });
    }
  };

  const handleStatusChange = (shift: any, status: 'draft' | 'published' | 'cancelled') => {
    updateShift.mutate({ 
      id: shift.id, 
      data: { 
        status,
        startTime: shift.startTime,
        endTime: shift.endTime,
        employeeId: shift.employeeId,
        workplaceId: shift.workplaceId,
        role: shift.role 
      } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      }
    });
  };

  // Generate week days
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const filteredShifts = user?.role === 'employee' ? shifts.filter(s => s.employeeId === user.id) : shifts;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold font-sans tracking-tight text-foreground">Schedule</h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">Weekly shift planner</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-card rounded-md border shadow-sm p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(addDays(currentDate, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-4 font-semibold text-sm">
              {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(addDays(currentDate, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {user?.role !== 'employee' && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="font-semibold"><Plus className="w-4 h-4 mr-2" /> New Shift</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Shift</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="employeeId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Employee (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="0">Unassigned (Open)</SelectItem>
                                {users.filter(u => u.status === 'active').map(u => (
                                  <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="workplaceId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {workplaces.map(w => (
                                  <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startTimeDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date</FormLabel>
                            <FormControl><Input type="date" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="startTimeTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Time</FormLabel>
                            <FormControl><Input type="time" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="endTimeDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Date</FormLabel>
                            <FormControl><Input type="date" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="endTimeTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Time</FormLabel>
                            <FormControl><Input type="time" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role/Duty (Optional)</FormLabel>
                            <FormControl><Input placeholder="e.g. Cashier" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="published">Published</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="flex justify-end pt-4">
                      <Button type="submit" disabled={createShift.isPending}>
                        {createShift.isPending ? "Creating..." : "Create Shift"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        {days.map((day, i) => {
          const dayShifts = filteredShifts.filter(s => isSameDay(parseISO(s.startTime), day));
          const isTodayDate = isSameDay(new Date(), day);
          
          return (
            <div key={i} className="flex flex-col h-full min-h-[400px]">
              <div className={`p-3 text-center border-b-4 ${isTodayDate ? 'border-primary bg-primary/5' : 'border-transparent'}`}>
                <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{format(day, 'EEE')}</div>
                <div className={`text-2xl font-bold font-sans mt-1 ${isTodayDate ? 'text-primary' : ''}`}>{format(day, 'd')}</div>
              </div>
              <div className="flex-1 bg-card/40 border border-border/50 border-t-0 p-2 space-y-2 rounded-b-lg">
                {dayShifts.map(shift => {
                  const employee = users.find(u => u.id === shift.employeeId);
                  const workplace = workplaces.find(w => w.id === shift.workplaceId);
                  
                  return (
                    <div key={shift.id} className={`p-3 rounded-md border shadow-sm group relative ${shift.status === 'draft' ? 'bg-muted/50 border-dashed border-muted-foreground/30' : 'bg-card border-border hover-elevate'}`}>
                      <div className="font-mono text-xs font-bold text-foreground">
                        {format(parseISO(shift.startTime), 'HH:mm')} - {format(parseISO(shift.endTime), 'HH:mm')}
                      </div>
                      
                      {user?.role !== 'employee' && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className={!employee ? "text-accent italic" : ""}>
                            {employee ? employee.name : "Unassigned"}
                          </span>
                        </div>
                      )}
                      
                      {workplace && (
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{workplace.name}</span>
                        </div>
                      )}
                      
                      {shift.role && (
                        <div className="mt-2 inline-block bg-accent/10 text-accent-foreground text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded">
                          {shift.role}
                        </div>
                      )}

                      {user?.role !== 'employee' && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-card/80 backdrop-blur rounded shadow-sm border p-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(shift.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
