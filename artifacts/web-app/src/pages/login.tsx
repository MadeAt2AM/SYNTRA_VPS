import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const { data: branding } = useBranding();
  const brandName = (branding?.branded ? branding.name : "SYNTRA") ?? "SYNTRA";
  const brandBadge = branding?.branded && branding.logoUrl
    ? <img src={branding.logoUrl} alt={brandName} className="mx-auto mb-2 max-h-12 max-w-[160px]" />
    : (
      <div className="mx-auto w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center mb-2 shadow-lg font-bold text-lg">
        {branding?.branded ? (branding.logoText || brandName.slice(0, 2).toUpperCase()) : "SY"}
      </div>
    );

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate({ data: values }, {
      onSuccess: (response) => {
        const mustChange = (response as any).user?.mustChangePassword ?? false;
        // If the API says this user's company has a verified customDomain
        // and the request came in on a different host, bounce the WHOLE
        // session to that domain so localStorage, cookies, branding, and
        // future redirects all live on the customer's origin.
        const redirectTo: string | null = (response as any).redirectTo ?? null;
        if (redirectTo) {
          login(response.token, mustChange);
          // Full-page navigation (not wouter's setLocation) is required —
          // wouter routes are in-memory and can't cross origins.
          window.location.assign(redirectTo);
          return;
        }
        login(response.token, mustChange);
        if (mustChange) {
          setLocation("/change-password");
        } else {
          const role = (response as any).user?.role;
          setLocation(role === "platform_admin" ? "/platform" : "/dashboard");
        }
      },
      onError: (err: any) => {
        const body = err?.data;
        toast({ title: "Login failed", description: body?.error === "Invalid user" ? "Invalid user" : "Invalid email or password.", variant: "destructive" });
      }
    });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />

      <Link href="/" className="z-10 mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={14} /> Back to SYNTRA home
      </Link>

      <Card className="w-full max-w-md shadow-2xl border-border/50 bg-card/80 backdrop-blur-sm z-10">
        <CardHeader className="space-y-3 pb-6 text-center">
          {brandBadge}
          <CardTitle className="text-2xl font-bold font-sans tracking-tight">{brandName}</CardTitle>
          <CardDescription className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
            {branding?.branded ? "Workforce Management" : "Workforce Management Platform"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground/80">Work Email</FormLabel>
                    <FormControl>
                      <Input placeholder="name@company.com" {...field} className="bg-background/50 border-border/50 h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground/80">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="bg-background/50 border-border/50 h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-11 text-base font-bold tracking-wide" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-3 border-t border-border/30 pt-5 mt-2">
          <Link href="/forgot-password" className="text-xs text-primary font-semibold hover:underline">
            Forgot your password?
          </Link>
          <p className="text-xs text-muted-foreground text-center">
            Access is by invitation only. <Link href="/#enquire" className="text-primary font-semibold hover:underline">Contact us</Link> to get started.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
