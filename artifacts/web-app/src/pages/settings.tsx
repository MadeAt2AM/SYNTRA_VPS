import { useAuth } from "@/hooks/use-auth";
import { useGetCompany, useUpdateCompany, useUpdateUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Building, User, Mail, KeyRound, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { apiSaveSmtp, apiTestSmtp, apiChangePassword } from "@/lib/platform-api";
import { Switch } from "@/components/ui/switch";

const profileSchema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().optional().nullable(),
});

const companySchema = z.object({
  name: z.string().min(2, "Name required"),
  address: z.string().optional().nullable(),
  timezone: z.string().min(1, "Timezone required"),
  overtimeThreshold: z.string().min(1, "Threshold required"),
});

const smtpSchema = z.object({
  host: z.string().min(1, "Host required"),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  user: z.string().min(1, "Username required"),
  pass: z.string().min(1, "Password required"),
  from: z.string().min(1, "From address required"),
});

const changePassSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z.string().min(8, "Min 8 characters"),
  confirmPassword: z.string().min(8),
}).refine(d => d.newPassword === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [showGmailSteps, setShowGmailSteps] = useState(false);

  const updateUser = useUpdateUser();
  const updateCompany = useUpdateCompany();

  const { data: company, isLoading: companyLoading } = useGetCompany(user?.companyId || 0, {
    query: { enabled: !!user && !!user.companyId && user.role === 'admin', queryKey: ['/api/companies', user?.companyId || 0] }
  });

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", phone: "" },
  });

  const companyForm = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: "", address: "", timezone: "UTC", overtimeThreshold: "40" },
  });

  const smtpForm = useForm<z.infer<typeof smtpSchema>>({
    resolver: zodResolver(smtpSchema),
    defaultValues: { host: "", port: 587, secure: false, user: "", pass: "", from: "" },
  });

  const passForm = useForm<z.infer<typeof changePassSchema>>({
    resolver: zodResolver(changePassSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (user) profileForm.reset({ name: user.name, phone: user.phone });
  }, [user]);

  useEffect(() => {
    if (company) {
      companyForm.reset({ name: company.name, address: company.address, timezone: company.timezone, overtimeThreshold: company.overtimeThreshold });
      const smtp = (company as any).smtpConfig;
      if (smtp) smtpForm.reset({ host: smtp.host || "", port: smtp.port || 587, secure: smtp.secure || false, user: smtp.user || "", pass: smtp.pass || "", from: smtp.from || "" });
    }
  }, [company]);

  function onProfileSubmit(values: z.infer<typeof profileSchema>) {
    if (!user) return;
    updateUser.mutate({ id: user.id, data: values }, {
      onSuccess: () => {
        toast({ title: "Profile updated" });
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      }
    });
  }

  function onCompanySubmit(values: z.infer<typeof companySchema>) {
    if (!company) return;
    updateCompany.mutate({ id: company.id, data: values }, {
      onSuccess: () => {
        toast({ title: "Company settings saved" });
        queryClient.invalidateQueries({ queryKey: ['/api/companies', company.id] });
      }
    });
  }

  async function onSmtpTest(values: z.infer<typeof smtpSchema>) {
    if (!user?.companyId) return;
    setSmtpTesting(true);
    try {
      const res = await apiTestSmtp(user.companyId, values);
      if (res.success) {
        toast({ title: "SMTP Connected ✓", description: "Connection verified successfully." });
      } else {
        toast({ title: "SMTP Failed", description: res.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Test failed", variant: "destructive" });
    } finally {
      setSmtpTesting(false);
    }
  }

  async function onSmtpSave(values: z.infer<typeof smtpSchema>) {
    if (!user?.companyId) return;
    setSmtpSaving(true);
    try {
      await apiSaveSmtp(user.companyId, values);
      toast({ title: "SMTP settings saved" });
      queryClient.invalidateQueries({ queryKey: ['/api/companies', user.companyId] });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.data?.error, variant: "destructive" });
    } finally {
      setSmtpSaving(false);
    }
  }

  async function onPasswordChange(values: z.infer<typeof changePassSchema>) {
    setChangingPass(true);
    try {
      await apiChangePassword(values.currentPassword, values.newPassword);
      toast({ title: "Password changed successfully" });
      passForm.reset();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Could not change password", variant: "destructive" });
    } finally {
      setChangingPass(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold font-sans tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 font-mono text-xs uppercase tracking-widest">Manage your preferences</p>
      </div>

      {/* Profile */}
      <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-2"><User className="w-4 h-4 text-primary" /><CardTitle className="text-base">Personal Profile</CardTitle></div>
          <CardDescription>Update your name and phone number.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={profileForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={profileForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={updateUser.isPending}>{updateUser.isPending ? "Saving..." : "Save Profile"}</Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /><CardTitle className="text-base">Change Password</CardTitle></div>
          <CardDescription>Update your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passForm}>
            <form onSubmit={passForm.handleSubmit(onPasswordChange)} className="space-y-4">
              <FormField control={passForm.control} name="currentPassword" render={({ field }) => (
                <FormItem><FormLabel>Current Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={passForm.control} name="newPassword" render={({ field }) => (
                  <FormItem><FormLabel>New Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={passForm.control} name="confirmPassword" render={({ field }) => (
                  <FormItem><FormLabel>Confirm Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={changingPass}>{changingPass ? "Changing..." : "Change Password"}</Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Company Settings - admin only */}
      {user?.role === 'admin' && company && !companyLoading && (
        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur border-t-4 border-t-primary">
          <CardHeader>
            <div className="flex items-center gap-2"><Building className="w-4 h-4 text-primary" /><CardTitle className="text-base">Company Settings</CardTitle></div>
            <CardDescription>Manage organisation-wide configurations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...companyForm}>
              <form onSubmit={companyForm.handleSubmit(onCompanySubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={companyForm.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Company Name</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={companyForm.control} name="address" render={({ field }) => (
                    <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={companyForm.control} name="timezone" render={({ field }) => (
                    <FormItem><FormLabel>Timezone</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={companyForm.control} name="overtimeThreshold" render={({ field }) => (
                    <FormItem><FormLabel>Overtime Threshold (hrs/week)</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={updateCompany.isPending}>{updateCompany.isPending ? "Saving..." : "Save Company"}</Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* SMTP Settings - admin only */}
      {user?.role === 'admin' && (
        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /><CardTitle className="text-base">Email / SMTP Settings</CardTitle></div>
            <CardDescription>Configure email delivery for invitations and notifications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Gmail App Password Guide */}
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowGmailSteps(s => !s)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold bg-muted/40 hover:bg-muted/60 transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">📧</span> How to get a Gmail App Password
                </span>
                {showGmailSteps ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showGmailSteps && (
                <div className="px-4 py-4 space-y-3 text-sm border-t border-border/40 bg-muted/10">
                  <p className="text-muted-foreground text-xs">Gmail requires an App Password (not your regular password) when 2-Step Verification is enabled.</p>
                  <ol className="space-y-2 list-decimal list-inside text-foreground/80">
                    <li>Go to your Google Account → <strong>Security</strong></li>
                    <li>Under "How you sign in to Google", ensure <strong>2-Step Verification</strong> is turned on</li>
                    <li>In the search bar at the top of your Google Account page, type <strong>"App Passwords"</strong> and open it</li>
                    <li>In the "App name" field, type <strong>SYNTRA</strong> (or any name) and click <strong>Create</strong></li>
                    <li>Google will display a <strong>16-character password</strong> — copy it (spaces are optional)</li>
                    <li>Paste it into the <strong>Password / App Password</strong> field below</li>
                  </ol>
                  <div className="mt-3 p-3 bg-muted/50 rounded-md text-xs font-mono space-y-1 text-muted-foreground">
                    <div><span className="text-foreground font-semibold">Host:</span> smtp.gmail.com</div>
                    <div><span className="text-foreground font-semibold">Port:</span> 587</div>
                    <div><span className="text-foreground font-semibold">SSL/TLS:</span> Off (uses STARTTLS)</div>
                    <div><span className="text-foreground font-semibold">Username:</span> your full Gmail address</div>
                    <div><span className="text-foreground font-semibold">Password:</span> 16-character App Password</div>
                  </div>
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary text-xs font-semibold hover:underline mt-1"
                  >
                    Open Google App Passwords <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Custom SMTP note */}
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2.5 border border-border/40">
              <span className="font-semibold text-foreground">Custom SMTP:</span> Port 465 uses SSL/TLS · Port 587 uses STARTTLS · Username and From Address can use different email domains on the same host.
            </div>

            <Form {...smtpForm}>
              <form className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <FormField control={smtpForm.control} name="host" render={({ field }) => (
                      <FormItem><FormLabel>SMTP Host</FormLabel><FormControl><Input placeholder="smtp.gmail.com" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={smtpForm.control} name="port" render={({ field }) => (
                    <FormItem><FormLabel>Port</FormLabel><FormControl><Input type="number" placeholder="587" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={smtpForm.control} name="secure" render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="!mt-0">Use SSL/TLS (port 465)</FormLabel>
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={smtpForm.control} name="user" render={({ field }) => (
                    <FormItem><FormLabel>Username</FormLabel><FormControl><Input placeholder="your@email.com" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={smtpForm.control} name="pass" render={({ field }) => (
                    <FormItem><FormLabel>Password / App Password</FormLabel><FormControl><Input type="password" placeholder="••••••••••••" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={smtpForm.control} name="from" render={({ field }) => (
                  <FormItem>
                    <FormLabel>From Address</FormLabel>
                    <FormControl><Input placeholder='SYNTRA <noreply@yourcompany.com>' {...field} /></FormControl>
                    <p className="text-[11px] text-muted-foreground mt-1">Can be a different domain than your username — e.g. username is <code>support@host.com</code>, from is <code>noreply@company.com</code></p>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" disabled={smtpTesting} onClick={smtpForm.handleSubmit(onSmtpTest)}>
                    {smtpTesting ? "Testing..." : "Test Connection"}
                  </Button>
                  <Button type="button" size="sm" disabled={smtpSaving} onClick={smtpForm.handleSubmit(onSmtpSave)}>
                    {smtpSaving ? "Saving..." : "Save SMTP Settings"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
