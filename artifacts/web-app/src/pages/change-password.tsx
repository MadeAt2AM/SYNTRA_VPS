import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiChangePassword } from "@/lib/platform-api";
import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

const schema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function ChangePasswordPage() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isMustChange = user?.mustChangePassword;

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setLoading(true);
    try {
      await apiChangePassword(undefined, values.newPassword);
      localStorage.removeItem("must_change_password");
      toast({ title: "Password changed", description: "You can now use your new password." });
      const dest = user?.role === "platform_admin" ? "/platform" : "/dashboard";
      setLocation(dest);
      // Force a page reload to refresh the auth context
      window.location.href = dest;
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Could not change password.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />

      <Card className="w-full max-w-md shadow-2xl border-border/50 bg-card/80 backdrop-blur-sm z-10">
        <CardHeader className="space-y-3 pb-6 text-center">
          <div className="mx-auto w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center mb-2 shadow-lg">
            {isMustChange ? <ShieldCheck size={22} /> : <KeyRound size={22} />}
          </div>
          <CardTitle className="text-2xl font-bold">
            {isMustChange ? "Set Your Password" : "Change Password"}
          </CardTitle>
          <CardDescription>
            {isMustChange
              ? "You're logging in for the first time. Please set a new password to continue."
              : "Choose a strong new password for your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Min. 8 characters" {...field} className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Repeat your new password" {...field} className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-11 text-base font-bold" disabled={loading}>
                {loading ? "Saving..." : "Set Password & Continue"}
              </Button>
              {isMustChange && (
                <Button type="button" variant="ghost" className="w-full text-sm text-muted-foreground" onClick={logout}>
                  Sign out instead
                </Button>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
