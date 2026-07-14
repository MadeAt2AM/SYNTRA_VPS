import {
  usePlatformStats, usePlatformCompanies, usePlatformCreateCompany, usePlatformCompany, usePlatformImpersonate,
  usePlatformUpdateCompany, usePlatformVerifyDomain, usePlatformDomainInstructions, usePlatformAddAdmin,
  usePlatformAdmins, usePlatformAddPlatformAdmin, usePlatformSettings, usePlatformSaveSettings, usePlatformTestSmtp,
} from "@/lib/platform-api";
import type { CreateCompanyResult, PlatformCompany, PlatformCompanyUser, PlatformAdminUser } from "@/lib/platform-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { Building, Users, Activity, Plus, Copy, CheckCircle2, Eye, EyeOff, LogIn, Pencil, Globe, ShieldPlus, RefreshCw, Mail, Settings as SettingsIcon, Send } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

const createCompanySchema = z.object({
  name: z.string().min(2, "Company name required"),
  plan: z.enum(["starter", "professional", "enterprise"]),
  ownerName: z.string().min(2, "Owner name required"),
  ownerEmail: z.string().email("Valid email required"),
  ownerTempPassword: z.string().min(6, "Min 6 characters"),
});

const editCompanySchema = z.object({
  name: z.string().min(2, "Company name required"),
  status: z.enum(["active", "inactive", "suspended"]),
  plan: z.enum(["starter", "professional", "enterprise"]),
  timezone: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  overtimeThreshold: z.string().optional(),
  weekStartDay: z.coerce.number().int().min(0).max(6),
  customDomain: z.string().optional(),
});

const addAdminSchema = z.object({
  name: z.string().min(2, "Name required"),
  email: z.string().email("Valid email required"),
  tempPassword: z.string().min(6, "Min 6 characters"),
});

const addPlatformAdminSchema = z.object({
  name: z.string().min(2, "Name required"),
  email: z.string().email("Valid email required"),
  tempPassword: z.string().min(6, "Min 6 characters"),
});

const platformSettingsSchema = z.object({
  host: z.string().min(1, "Required"),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1, "Required"),
  pass: z.string().min(1, "Required"),
  from: z.string().min(1, "Required"),
  contactEmailTo: z.string().email("Valid email required"),
});

export default function PlatformPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { data: stats, isLoading: statsLoading } = usePlatformStats();
  const { data: companies = [], isLoading: companiesLoading } = usePlatformCompanies();
  const createCompany = usePlatformCreateCompany();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CreateCompanyResult | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState(false);

  // Company detail / impersonation
  const [detailCompanyId, setDetailCompanyId] = useState<number | null>(null);
  const { data: companyDetail, isLoading: detailLoading } = usePlatformCompany(detailCompanyId);
  const impersonate = usePlatformImpersonate();

  // Edit company
  const [editOpen, setEditOpen] = useState(false);
  const updateCompany = usePlatformUpdateCompany();
  const editForm = useForm<z.infer<typeof editCompanySchema>>({
    resolver: zodResolver(editCompanySchema),
    defaultValues: { name: "", status: "active", plan: "starter", timezone: "UTC", address: "", phone: "", overtimeThreshold: "40", weekStartDay: 1, customDomain: "" },
  });

  function openEdit() {
    if (!companyDetail) return;
    editForm.reset({
      name: companyDetail.name,
      status: (companyDetail.status as "active" | "inactive" | "suspended") ?? "active",
      plan: (companyDetail.plan as "starter" | "professional" | "enterprise") ?? "starter",
      timezone: companyDetail.timezone ?? "UTC",
      address: companyDetail.address ?? "",
      phone: companyDetail.phone ?? "",
      overtimeThreshold: companyDetail.overtimeThreshold ?? "40",
      weekStartDay: companyDetail.weekStartDay ?? 1,
      customDomain: companyDetail.customDomain ?? "",
    });
    setEditOpen(true);
  }

  function onEditSubmit(values: z.infer<typeof editCompanySchema>) {
    if (!detailCompanyId) return;
    updateCompany.mutate(
      { id: detailCompanyId, data: { ...values, address: values.address || null, phone: values.phone || null, customDomain: values.customDomain || null } },
      {
        onSuccess: () => {
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: ['platform', 'companies'] });
          queryClient.invalidateQueries({ queryKey: ['platform', 'companies', detailCompanyId] });
          toast({ title: "Company updated" });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error || "Failed to update company.", variant: "destructive" });
        },
      },
    );
  }

  // Custom domain
  const { data: domainInstructions } = usePlatformDomainInstructions(detailCompanyId);
  const verifyDomain = usePlatformVerifyDomain();

  function handleVerifyDomain() {
    if (!detailCompanyId) return;
    verifyDomain.mutate(detailCompanyId, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['platform', 'companies', detailCompanyId] });
        queryClient.invalidateQueries({ queryKey: ['platform', 'companies'] });
        toast({
          title: data.domainStatus === "verified" ? "Domain verified" : "Not verified yet",
          description: data.checkDetail,
          variant: data.domainStatus === "verified" ? undefined : "destructive",
        });
      },
      onError: (err: any) => {
        toast({ title: "Verification failed", description: err?.data?.error || "Could not check DNS.", variant: "destructive" });
      },
    });
  }

  // Add admin to existing company
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const addAdmin = usePlatformAddAdmin();
  const addAdminForm = useForm<z.infer<typeof addAdminSchema>>({
    resolver: zodResolver(addAdminSchema),
    defaultValues: { name: "", email: "", tempPassword: "" },
  });

  function onAddAdminSubmit(values: z.infer<typeof addAdminSchema>) {
    if (!detailCompanyId) return;
    addAdmin.mutate({ companyId: detailCompanyId, data: values }, {
      onSuccess: () => {
        setAddAdminOpen(false);
        addAdminForm.reset();
        queryClient.invalidateQueries({ queryKey: ['platform', 'companies', detailCompanyId] });
        queryClient.invalidateQueries({ queryKey: ['platform', 'stats'] });
        toast({ title: "Admin added", description: "A welcome email with their temporary password was sent if SMTP is configured." });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.data?.error || "Failed to add admin.", variant: "destructive" });
      },
    });
  }

  // Platform team (other platform-admin accounts)
  const { data: platformAdmins = [], isLoading: adminsLoading } = usePlatformAdmins();
  const [addPlatformAdminOpen, setAddPlatformAdminOpen] = useState(false);
  const addPlatformAdmin = usePlatformAddPlatformAdmin();
  const addPlatformAdminForm = useForm<z.infer<typeof addPlatformAdminSchema>>({
    resolver: zodResolver(addPlatformAdminSchema),
    defaultValues: { name: "", email: "", tempPassword: "" },
  });

  function onAddPlatformAdminSubmit(values: z.infer<typeof addPlatformAdminSchema>) {
    addPlatformAdmin.mutate(values, {
      onSuccess: () => {
        setAddPlatformAdminOpen(false);
        addPlatformAdminForm.reset();
        queryClient.invalidateQueries({ queryKey: ['platform', 'admins'] });
        queryClient.invalidateQueries({ queryKey: ['platform', 'stats'] });
        toast({ title: "Platform admin added", description: `${values.name} now has full platform console access.` });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.data?.error || "Failed to add platform admin.", variant: "destructive" });
      },
    });
  }

  // Platform-wide settings (contact form SMTP)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: platformSettingsData, isLoading: settingsLoading } = usePlatformSettings();
  const saveSettings = usePlatformSaveSettings();
  const testSmtp = usePlatformTestSmtp();
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const settingsForm = useForm<z.infer<typeof platformSettingsSchema>>({
    resolver: zodResolver(platformSettingsSchema),
    defaultValues: { host: "", port: 587, secure: false, user: "", pass: "", from: "", contactEmailTo: "" },
  });

  function openSettings() {
    setSmtpTestResult(null);
    settingsForm.reset({
      host: platformSettingsData?.smtp?.host ?? "",
      port: platformSettingsData?.smtp?.port ?? 587,
      secure: platformSettingsData?.smtp?.secure ?? false,
      user: platformSettingsData?.smtp?.user ?? "",
      pass: "",
      from: platformSettingsData?.contactEmailFrom ?? platformSettingsData?.smtp?.from ?? "",
      contactEmailTo: platformSettingsData?.contactEmailTo ?? "",
    });
    setSettingsOpen(true);
  }

  function onSettingsSubmit(values: z.infer<typeof platformSettingsSchema>) {
    saveSettings.mutate(
      {
        smtp: { host: values.host, port: values.port, secure: values.secure, user: values.user, pass: values.pass, from: values.from },
        contactEmailTo: values.contactEmailTo,
        contactEmailFrom: values.from,
      },
      {
        onSuccess: () => {
          setSettingsOpen(false);
          queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
          toast({ title: "Settings saved", description: "The website contact form will use this SMTP configuration." });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error || "Failed to save settings.", variant: "destructive" });
        },
      },
    );
  }

  function handleTestSmtp() {
    const values = settingsForm.getValues();
    testSmtp.mutate(
      { host: values.host, port: values.port, secure: values.secure, user: values.user, pass: values.pass, from: values.from },
      {
        onSuccess: (data) => setSmtpTestResult(data),
        onError: (err: any) => setSmtpTestResult({ success: false, message: err?.data?.message || "Connection failed." }),
      },
    );
  }

  function handleImpersonate(targetUser: PlatformCompanyUser) {
    impersonate.mutate(targetUser.id, {
      onSuccess: (data) => {
        login(data.token);
        setDetailCompanyId(null);
        toast({ title: `Signed in as ${targetUser.name}`, description: "You're now viewing SYNTRA as this user." });
        navigate("/dashboard");
      },
      onError: (err: any) => {
        toast({ title: "Impersonation failed", description: err?.data?.error || "Could not sign in as this user.", variant: "destructive" });
      },
    });
  }

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

  // Pull the temp password straight from the API response. Reading it
  // from the form state used to break because the form is reset on
  // success — leaving the field blank right when we need to display it.
  // The server only echoes the plaintext temp password once (in the 201
  // response of POST /api/platform/companies), and never re-serves it
  // from GET endpoints, so this is the only place we can read it.
  const tempPassword = result?.tempPassword ?? "";

  async function copyPassword() {
    if (!tempPassword) return;
    try {
      // Prefer the async Clipboard API (requires HTTPS + user gesture —
      // both true here because this fires from a button click on
      // syntra.terrybot.top). Fall back to the legacy document.execCommand
      // path on older browsers / non-secure contexts.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(tempPassword);
      } else {
        const ta = document.createElement("textarea");
        ta.value = tempPassword;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Surface a toast rather than failing silently — the user clicked
      // the button expecting something to happen.
      toast({
        title: "Could not copy",
        description: "Your browser blocked clipboard access. Select the password and copy manually.",
        variant: "destructive",
      });
    }
  }

  function handleClose() {
    setOpen(false);
    setResult(null);
    form.reset();
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold font-sans tracking-tight text-foreground">Platform Overview</h1>
          <p className="text-muted-foreground mt-2 font-mono text-xs uppercase tracking-widest">SYNTRA Master Control Panel</p>
        </div>
        <Button variant="outline" className="gap-2 font-semibold" onClick={openSettings}>
          <SettingsIcon className="w-4 h-4" /> Platform Settings
        </Button>
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
                      <div className="flex-1 font-mono text-sm bg-background rounded border px-3 py-2 select-all" data-testid="temp-password">
                        {showPass ? tempPassword : (tempPassword ? "••••••••••••" : "—")}
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
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Domain</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companiesLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : companies.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No companies yet. Create your first one above.</TableCell></TableRow>
                ) : (
                  companies.map((company: PlatformCompany) => (
                    <TableRow key={company.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setDetailCompanyId(company.id)}>
                      <TableCell className="font-mono text-xs text-muted-foreground">#{company.id}</TableCell>
                      <TableCell className="font-semibold">{company.name}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded text-xs font-mono border ${company.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'}`}>
                          {company.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{company.plan}</TableCell>
                      <TableCell className="text-sm">
                        {company.customDomain ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-mono border ${
                            company.domainStatus === 'verified' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                          }`}>
                            {company.customDomain}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
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

      <div className="space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold font-sans tracking-tight">Platform Team</h2>
            <p className="text-xs text-muted-foreground mt-1">Accounts with full master-console access across every company.</p>
          </div>
          <Button variant="outline" className="gap-2 font-semibold" onClick={() => setAddPlatformAdminOpen(true)}>
            <ShieldPlus className="w-4 h-4" /> Add Platform Admin
          </Button>
        </div>
        <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Name</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Email</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminsLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : platformAdmins.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No platform admins yet.</TableCell></TableRow>
                ) : (
                  platformAdmins.map((admin: PlatformAdminUser) => (
                    <TableRow key={admin.id} className="hover:bg-muted/30">
                      <TableCell className="font-semibold">{admin.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{admin.email}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded text-xs font-mono border ${admin.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'}`}>
                          {admin.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {admin.createdAt ? format(new Date(admin.createdAt), 'MMM d, yyyy') : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* ── Company Detail / Impersonation Dialog ── */}
      <Dialog open={detailCompanyId !== null} onOpenChange={(v) => !v && setDetailCompanyId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle>{companyDetail?.name ?? "Company"}</DialogTitle>
              {companyDetail && (
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={openEdit}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
            </div>
            <DialogDescription>
              View staff, manage the company profile, and sign in as a user for support purposes.
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading...</p>
          ) : !companyDetail ? (
            <p className="text-sm text-muted-foreground py-4">Company not found.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                <span>#{companyDetail.id}</span>
                <span className="capitalize">{companyDetail.plan}</span>
                <span className="capitalize">{companyDetail.status}</span>
              </div>

              {/* Custom domain */}
              <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" /> Custom Domain
                </div>
                {companyDetail.customDomain ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{companyDetail.customDomain}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-mono border ${
                        companyDetail.domainStatus === 'verified' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : companyDetail.domainStatus === 'failed' ? 'bg-destructive/10 text-destructive border-destructive/20'
                        : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      }`}>
                        {companyDetail.domainStatus}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={verifyDomain.isPending} onClick={handleVerifyDomain}>
                      <RefreshCw className={`h-3.5 w-3.5 ${verifyDomain.isPending ? 'animate-spin' : ''}`} /> Verify
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No custom domain configured. Add one from Edit.</p>
                )}
                {companyDetail.customDomain && companyDetail.domainStatus !== 'verified' && domainInstructions?.target && (
                  <div className="text-xs text-muted-foreground bg-background rounded border p-2 mt-1">
                    Ask the customer to create a <span className="font-mono font-semibold">CNAME</span> record for{" "}
                    <span className="font-mono">{companyDetail.customDomain}</span> pointing to{" "}
                    <span className="font-mono font-semibold">{domainInstructions.target}</span>, then click Verify.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Staff</p>
                <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => setAddAdminOpen(true)}>
                  <ShieldPlus className="h-3.5 w-3.5" /> Add Admin
                </Button>
              </div>
              <div className="border rounded-lg divide-y">
                {companyDetail.users.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">No users in this company yet.</p>
                ) : (
                  companyDetail.users.map((u: PlatformCompanyUser) => (
                    <div key={u.id} className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-semibold">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email} · <span className="capitalize">{u.role}</span></p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        disabled={impersonate.isPending || u.status !== "active"}
                        onClick={() => handleImpersonate(u)}
                      >
                        <LogIn className="h-3.5 w-3.5" /> Sign in as
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Company Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update profile, plan, and the custom domain for this company.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Company Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="plan" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="timezone" render={({ field }) => (
                  <FormItem><FormLabel>Timezone</FormLabel><FormControl><Input placeholder="UTC" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="overtimeThreshold" render={({ field }) => (
                  <FormItem><FormLabel>Overtime Threshold (hrs/wk)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="weekStartDay" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Week Starts On</FormLabel>
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d, i) => (
                          <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="border-t border-border/50 pt-4">
                <FormField control={editForm.control} name="customDomain" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Custom Domain</FormLabel>
                    <FormControl><Input placeholder="login.customer.com" {...field} /></FormControl>
                    <p className="text-xs text-muted-foreground">Clear this field to remove the domain. Changing it resets verification to pending.</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateCompany.isPending} className="font-semibold">
                  {updateCompany.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Platform Settings Dialog (contact-form SMTP) ── */}
      <Dialog open={settingsOpen} onOpenChange={(v) => { setSettingsOpen(v); if (!v) setSmtpTestResult(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Platform Settings</DialogTitle>
            <DialogDescription>
              Configure the SMTP server used to send email, and which inbox receives new landing-page contact-form enquiries.
            </DialogDescription>
          </DialogHeader>
          {settingsLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading...</p>
          ) : (
            <Form {...settingsForm}>
              <form onSubmit={settingsForm.handleSubmit(onSettingsSubmit)} className="space-y-4 pt-2">
                <div className="border-t border-border/50 pt-4">
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-3">SMTP Server</p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={settingsForm.control} name="host" render={({ field }) => (
                      <FormItem><FormLabel>Host</FormLabel><FormControl><Input placeholder="smtp.example.com" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={settingsForm.control} name="port" render={({ field }) => (
                      <FormItem><FormLabel>Port</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <FormField control={settingsForm.control} name="user" render={({ field }) => (
                      <FormItem><FormLabel>Username</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={settingsForm.control} name="pass" render={({ field }) => (
                      <FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" placeholder={platformSettingsData?.smtp?.host ? "Leave blank to keep current" : ""} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={settingsForm.control} name="secure" render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3 mt-4">
                      <div>
                        <FormLabel>Use TLS/SSL</FormLabel>
                        <p className="text-xs text-muted-foreground">Enable for port 465. Leave off for STARTTLS on 587.</p>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="border-t border-border/50 pt-4">
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-3">Contact Form</p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={settingsForm.control} name="from" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Send From</FormLabel>
                        <FormControl><Input placeholder="SYNTRA <no-reply@syntra.com>" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={settingsForm.control} name="contactEmailTo" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Send Enquiries To</FormLabel>
                        <FormControl><Input type="email" placeholder="sales@syntra.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>

                {smtpTestResult && (
                  <div className={`text-sm rounded-lg border p-3 ${smtpTestResult.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                    {smtpTestResult.message}
                  </div>
                )}

                <div className="flex justify-between items-center gap-2 pt-2">
                  <Button type="button" variant="outline" className="gap-1.5 font-semibold" onClick={handleTestSmtp} disabled={testSmtp.isPending}>
                    <Send className="w-4 h-4" /> {testSmtp.isPending ? "Sending..." : "Send Test"}
                  </Button>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={saveSettings.isPending} className="font-semibold">
                      {saveSettings.isPending ? "Saving..." : "Save Settings"}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add Platform Admin Dialog ── */}
      <Dialog open={addPlatformAdminOpen} onOpenChange={(v) => { setAddPlatformAdminOpen(v); if (!v) addPlatformAdminForm.reset(); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add Platform Admin</DialogTitle>
            <DialogDescription>
              Grant a new account full master-console access across every company, identical to your own.
            </DialogDescription>
          </DialogHeader>
          <Form {...addPlatformAdminForm}>
            <form onSubmit={addPlatformAdminForm.handleSubmit(onAddPlatformAdminSubmit)} className="space-y-4 pt-2">
              <FormField control={addPlatformAdminForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="Jane Smith" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={addPlatformAdminForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="jane@syntra.com" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={addPlatformAdminForm.control} name="tempPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>Temporary Password</FormLabel>
                  <FormControl><Input className="font-mono" {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">They'll be required to change this on first login.</p>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setAddPlatformAdminOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={addPlatformAdmin.isPending} className="font-semibold">
                  {addPlatformAdmin.isPending ? "Adding..." : "Add Platform Admin"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Add Admin Dialog ── */}
      <Dialog open={addAdminOpen} onOpenChange={(v) => { setAddAdminOpen(v); if (!v) addAdminForm.reset(); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add Admin</DialogTitle>
            <DialogDescription>
              Grant a new admin account for {companyDetail?.name ?? "this company"}. Company admins cannot self-grant this role — only a platform administrator can.
            </DialogDescription>
          </DialogHeader>
          <Form {...addAdminForm}>
            <form onSubmit={addAdminForm.handleSubmit(onAddAdminSubmit)} className="space-y-4 pt-2">
              <FormField control={addAdminForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="Jane Smith" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={addAdminForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="jane@company.com" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={addAdminForm.control} name="tempPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>Temporary Password</FormLabel>
                  <FormControl><Input className="font-mono" {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">They'll be required to change this on first login.</p>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setAddAdminOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={addAdmin.isPending} className="font-semibold">
                  {addAdmin.isPending ? "Adding..." : "Add Admin"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
