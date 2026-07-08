import { usePlatformStats, usePlatformCompanies, usePlatformCreateCompany } from "@/lib/platform-api";
import type { CreateCompanyResult, PlatformCompany } from "@/lib/platform-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { Building, Users, Activity, Plus, Copy, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const createCompanySchema = z.object({
  name: z.string().min(2, "Company name required"),
  plan: z.enum(["starter", "professional", "enterprise"]),
  ownerName: z.string().min(2, "Owner name required"),
  ownerEmail: z.string().email("Valid email required"),
  ownerTempPassword: z.string().min(6, "Min 6 characters"),
});

export default function PlatformPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: stats, isLoading: statsLoading } = usePlatformStats();
  const { data: companies = [], isLoading: companiesLoading } = usePlatformCompanies();
  const createCompany = usePlatformCreateCompany();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CreateCompanyResult | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState(false);

  const form = useForm<z.infer<typeof createCompanySchema>>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: { name: "", plan: "starter", ownerName: "", ownerEmail: "", ownerTempPassword: "" },
  });

  function onSubmit(values: z.infer<typeof createCompanySchema>) {
    createCompany.mutate(values, {
      onSuccess: (data) => {
        setResult(data);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ['platform', 'companies'] });
        queryClient.invalidateQueries({ queryKey: ['platform', 'stats'] });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.data?.error || "Failed to create company.", variant: "destructive" });
      }
    });
  }

  function copyPassword() {
    if (result?.owner) {
      navigator.clipboard.writeText(form.getValues("ownerTempPassword") || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleClose() {
    setOpen(false);
    setResult(null);
    form.reset();
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold font-sans tracking-tight text-foreground">Platform Overview</h1>
        <p className="text-muted-foreground mt-2 font-mono text-xs uppercase tracking-widest">SYNTRA Master Control Panel</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {[
          { label: "Total Companies", value: statsLoading ? "..." : stats?.totalCompanies, icon: <Building className="h-4 w-4 text-primary" /> },
          { label: "Active Companies", value: statsLoading ? "..." : stats?.activeCompanies, icon: <Activity className="h-4 w-4 text-accent" /> },
          { label: "Total Users", value: statsLoading ? "..." : stats?.totalUsers, icon: <Users className="h-4 w-4 text-primary" /> },
        ].map(s => (
          <Card key={s.label} className="border-border/50 shadow-md bg-card/80 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{s.label}</CardTitle>
              {s.icon}
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">{s.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <h2 className="text-xl font-bold font-sans tracking-tight">Companies</h2>
          <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="font-semibold"><Plus className="w-4 h-4 mr-2" /> New Company</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{result ? "Company Created!" : "Create Company"}</DialogTitle>
                <DialogDescription>
                  {result ? "Share the credentials below with the company owner." : "Creates a company and an owner account with a temporary password."}
                </DialogDescription>
              </DialogHeader>

              {result ? (
                <div className="space-y-4 pt-2">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Company:</span><span className="font-semibold">{result.company.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Plan:</span><span className="capitalize">{result.company.plan}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Owner:</span><span className="font-semibold">{result.owner?.name ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Email:</span><span className="font-mono text-xs">{result.owner?.email ?? "—"}</span></div>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mb-2 uppercase tracking-wider">Temporary Password — Share with owner</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-sm bg-background rounded border px-3 py-2">
                        {showPass ? form.getValues("ownerTempPassword") : "••••••••••••"}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => setShowPass(s => !s)}>
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={copyPassword}>
                        {copied ? <CheckCircle2 size={16} className="text-green-500" /> : <Copy size={16} />}
                      </Button>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">The owner will be asked to change this on first login.</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={handleClose}>Done</Button>
                    <Button className="flex-1" onClick={() => { setResult(null); }}>Create Another</Button>
                  </div>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl><Input placeholder="Acme Corp" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="plan" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plan</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="starter">Starter</SelectItem>
                              <SelectItem value="professional">Professional</SelectItem>
                              <SelectItem value="enterprise">Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="border-t border-border/50 pt-4">
                      <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-3">Owner Account</p>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="ownerName" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl><Input placeholder="Jane Smith" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="ownerEmail" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl><Input type="email" placeholder="jane@company.com" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    </div>
                    <FormField control={form.control} name="ownerTempPassword" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Temporary Password</FormLabel>
                        <FormControl><Input type="text" placeholder="Temp password (share with owner)" {...field} className="font-mono" /></FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">Owner will be required to change this on first login.</p>
                      </FormItem>
                    )} />
                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={createCompany.isPending} className="font-semibold">
                        {createCompany.isPending ? "Creating..." : "Create Company & Owner"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
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
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No companies yet. Create your first one above.</TableCell></TableRow>
                ) : (
                  companies.map((company: PlatformCompany) => (
                    <TableRow key={company.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">#{company.id}</TableCell>
                      <TableCell className="font-semibold">{company.name}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded text-xs font-mono border ${company.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'}`}>
                          {company.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{company.plan}</TableCell>
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
    </div>
  );
}
