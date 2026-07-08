import { useAuth } from "@/hooks/use-auth";
import { useListWorkplaces, useCreateWorkplace, useDeleteWorkplace, useUpdateWorkplace, getListWorkplacesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Trash2, AlertTriangle, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Workplace } from "@workspace/api-client-react";

const workplaceSchema = z.object({
  name: z.string().min(2, "Name required"),
  address: z.string().optional(),
  latitude: z.preprocess(
    v => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number({ invalid_type_error: "Must be a number" }).min(-90, "Must be ≥ -90").max(90, "Must be ≤ 90").optional()
  ),
  longitude: z.preprocess(
    v => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number({ invalid_type_error: "Must be a number" }).min(-180, "Must be ≥ -180").max(180, "Must be ≤ 180").optional()
  ),
  radiusMeters: z.coerce.number().min(10).default(100),
});

type FormValues = z.infer<typeof workplaceSchema>;

export default function WorkplacesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: workplaces = [], isLoading } = useListWorkplaces({ query: { enabled: !!user, queryKey: getListWorkplacesQueryKey() } });
  const createWorkplace = useCreateWorkplace();
  const updateWorkplace = useUpdateWorkplace();
  const deleteWorkplace = useDeleteWorkplace();

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Workplace | null>(null);

  const addForm = useForm<FormValues>({
    resolver: zodResolver(workplaceSchema),
    defaultValues: { name: "", address: "", latitude: undefined, longitude: undefined, radiusMeters: 100 },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(workplaceSchema),
    defaultValues: { name: "", address: "", latitude: undefined, longitude: undefined, radiusMeters: 100 },
  });

  if (user?.role === 'employee') return <div>Access Denied</div>;

  function onAdd(values: FormValues) {
    createWorkplace.mutate({ data: values }, {
      onSuccess: () => {
        setAddOpen(false);
        addForm.reset();
        queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey() });
        toast({ title: "Workplace created" });
      },
      onError: () => {
        toast({ title: "Failed to create workplace", variant: "destructive" });
      },
    });
  }

  function openEdit(wp: Workplace) {
    setEditTarget(wp);
    editForm.reset({
      name: wp.name,
      address: wp.address ?? "",
      latitude: wp.latitude ?? undefined,
      longitude: wp.longitude ?? undefined,
      radiusMeters: wp.radiusMeters,
    });
  }

  function onEdit(values: FormValues) {
    if (!editTarget) return;
    updateWorkplace.mutate({ id: editTarget.id, data: values }, {
      onSuccess: () => {
        setEditTarget(null);
        queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey() });
        toast({ title: "Workplace updated" });
      },
      onError: () => {
        toast({ title: "Failed to update workplace", variant: "destructive" });
      },
    });
  }

  const handleDelete = (id: number) => {
    if (confirm("Delete this workplace?")) {
      deleteWorkplace.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey() });
          toast({ title: "Workplace deleted" });
        },
      });
    }
  };

  const workplaceFormFields = (form: ReturnType<typeof useForm<FormValues>>) => (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Location Name</FormLabel>
            <FormControl>
              <Input placeholder="Main Office" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Address (Optional)</FormLabel>
            <FormControl>
              <Input placeholder="123 Business Rd" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="latitude"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Latitude</FormLabel>
              <FormControl>
                <Input type="number" step="any" placeholder="-33.8688" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="longitude"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Longitude</FormLabel>
              <FormControl>
                <Input type="number" step="any" placeholder="151.2093" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Required for geofence clock-in validation. Find coordinates on{" "}
        <a href="https://www.google.com/maps" target="_blank" rel="noreferrer" className="underline">Google Maps</a>{" "}
        by right-clicking a location.
      </p>
      <FormField
        control={form.control}
        name="radiusMeters"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Geofence Radius (Meters)</FormLabel>
            <FormControl>
              <Input type="number" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold font-sans tracking-tight text-foreground">Workplaces</h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">Manage locations</p>
        </div>
        <Button className="font-semibold" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Location
        </Button>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Workplace</DialogTitle>
            <DialogDescription>Define a physical location for your staff.</DialogDescription>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(onAdd)} className="space-y-4 pt-4">
              {workplaceFormFields(addForm)}
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createWorkplace.isPending}>
                  {createWorkplace.isPending ? "Adding..." : "Add Location"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workplace</DialogTitle>
            <DialogDescription>Update this location's details.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4 pt-4">
              {workplaceFormFields(editForm)}
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={updateWorkplace.isPending}>
                  {updateWorkplace.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            <CardTitle>Locations</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Name</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Address</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Coordinates</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Radius</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : workplaces.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No workplaces configured.</TableCell></TableRow>
                ) : (
                  workplaces.map((wp) => (
                    <TableRow key={wp.id} className="hover:bg-muted/30">
                      <TableCell className="font-semibold">{wp.name}</TableCell>
                      <TableCell className="text-muted-foreground">{wp.address || '-'}</TableCell>
                      <TableCell>
                        {wp.latitude != null && wp.longitude != null ? (
                          <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                            {Number(wp.latitude).toFixed(4)}, {Number(wp.longitude).toFixed(4)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3" /> Not set
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{wp.radiusMeters}m</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => openEdit(wp)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(wp.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
