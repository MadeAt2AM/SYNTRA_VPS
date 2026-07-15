import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, AlertTriangle } from "lucide-react";

const acceptSchema = z.object({
  name: z.string().min(2, { message: "Full name is required" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
});

export default function AcceptInvitePage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();

  // Read token and email from URL query params
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const email = params.get("email") || "";

  const form = useForm<z.infer<typeof acceptSchema>>({
    resolver: zodResolver(acceptSchema),
    defaultValues: { name: "", password: "" },
  });

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-xl border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-destructive/10 text-destructive rounded-lg flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <CardTitle className="text-xl font-bold">Invalid Invitation</CardTitle>
            <CardDescription>This invitation link is missing required information. Please request a new invitation.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link href="/login" className="text-primary font-semibold hover:underline text-sm">Back to login</Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  function onSubmit(values: z.infer<typeof acceptSchema>) {
    registerMutation.mutate(
      { data: { name: values.name, email, password: values.password, invitationToken: token } },
      {
        onSuccess: (response) => {
          // Same custom-domain bounce logic as login.tsx.
          const redirectTo: string | null = (response as any).redirectTo ?? null;
          if (redirectTo) {
            login(response.token);
            window.location.assign(redirectTo);
            return;
          }
          login(response.token);
          toast({ title: "Account created", description: "Welcome! Your account is ready." });
          setLocation("/");
        },
        onError: (err: any) => {
          toast({
            title: "Registration failed",
            description: err?.data?.error || "This invitation may have expired or already been used.",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />

      <Card className="w-full max-w-md shadow-2xl border-border/50 bg-card/80 backdrop-blur-sm z-10">
        <CardHeader className="space-y-3 pb-6 text-center">
          <div className="mx-auto w-12 h-12 bg-primary text-primary-foreground rounded-lg flex items-center justify-center mb-2 shadow-lg">
            <Briefcase size={24} />
          </div>
          <CardTitle className="text-3xl font-bold font-sans tracking-tight">Set Up Your Account</CardTitle>
          <CardDescription className="text-muted-foreground font-mono text-sm uppercase tracking-wider">
            Accept your invitation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-lg bg-muted/60 px-4 py-3 text-sm">
            <p className="text-muted-foreground text-xs uppercase tracking-wider font-mono mb-1">Invited email</p>
            <p className="font-semibold text-foreground">{email}</p>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground/80">Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} className="bg-background/50 h-10" />
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
                    <FormLabel className="font-semibold text-foreground/80">Choose a Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Min 8 characters" {...field} className="bg-background/50 h-10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-11 text-base font-bold tracking-wide mt-2" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Creating account..." : "Create Account & Join"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border/30 pt-6 mt-2">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">Sign in here</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
