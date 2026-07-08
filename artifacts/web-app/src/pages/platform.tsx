import { usePlatformStats, usePlatformCompanies, usePlatformCreateCompany } from "@/lib/platform-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { Building, Users, Activity, Plus } from "lucide-react";
import type { PlatformCompany } from "@/lib/platform-api";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

const createCompanySchema = z.object({
  name: z.string().min(2, "Name required"),
  plan: z.string().min(1, "Plan required")
});

export default function PlatformPage() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading } = usePlatformStats();
  const { data: companies = [], isLoading: companiesLoading } = usePlatformCompanies();
  const createCompany = usePlatformCreateCompany();
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof createCompanySchema>>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: { name: "", plan: "standard" },
  });

  function onSubmit(values: z.infer<typeof createCompanySchema>) {
    createCompany.mutate(values, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ['platform', 'companies'] });
        queryClient.invalidateQueries({ queryKey: ['platform', 'stats'] });
      }
    });
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-4xl font-bold font-sans tracking-tight text-foreground">Platform Overview</h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">Master Control Panel</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Total Companies</CardTitle>
            <Building className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{statsLoading ? "..." : stats?.totalCompanies}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Active Companies</CardTitle>
            <Activity className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{statsLoading ? "..." : stats?.activeCompanies}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Total Users</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{statsLoading ? "..." : stats?.totalUsers}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold font-sans tracking-tight">Companies</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="font-semibold"><Plus className="w-4 h-4 mr-2" /> New Company</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create Company</DialogTitle>
                <DialogDescription>Add a new tenant to the platform.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corp" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="plan"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan</FormLabel>
                        <FormControl>
                          <Input placeholder="standard" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={createCompany.isPending}>
                      {createCompany.isPending ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-mono text-xs uppercase tracking-wider">ID</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Name</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Plan</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companiesLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : companies.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No companies found.</TableCell></TableRow>
              ) : (
                companies.map((company: PlatformCompany) => (
                  <TableRow key={company.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs text-muted-foreground">#{company.id}</TableCell>
                    <TableCell className="font-semibold">{company.name}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs font-mono border ${company.status === 'active' ? 'bg-accent/10 text-accent-foreground border-accent/20' : 'bg-muted text-muted-foreground'}`}>
                        {company.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{company.plan}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {company.createdAt ? format(new Date(company.createdAt), 'MMM d, yyyy') : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
