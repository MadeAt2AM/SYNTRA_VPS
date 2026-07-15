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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Building, KeyRound } from "lucide-react";

const registerSchema = z.object({
  name: z.string().min(2, { message: "Name is required" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
  companyName: z.string().optional(),
  invitationToken: z.string().optional(),
});

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const [mode, setMode] = useState<"new_company" | "join_company">("new_company");

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      companyName: "",
      invitationToken: "",
    },
  });

  function onSubmit(values: z.infer<typeof registerSchema>) {
    const payload = { ...values };
    if (mode === "new_company") {
      delete payload.invitationToken;
      if (!payload.companyName) {
        form.setError("companyName", { message: "Company name is required" });
        return;
      }
    } else {
      delete payload.companyName;
      if (!payload.invitationToken) {
        form.setError("invitationToken", { message: "Invitation token is required" });
        return;
      }
    }

    registerMutation.mutate({ data: payload }, {
      onSuccess: (response) => {
        // Same custom-domain bounce logic as login — see login.tsx.
        const redirectTo: string | null = (response as any).redirectTo ?? null;
        if (redirectTo) {
          login(response.token);
          window.location.assign(redirectTo);
          return;
        }
        login(response.token);
        toast({ title: "Account created", description: "Welcome to ShiftWise!" });
        setLocation("/");
      },
      onError: (err) => {
        toast({
          title: "Registration failed",
          description: err.data?.error || "An error occurred during registration.",
          variant: "destructive"
        });
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />

      <Card className="w-full max-w-lg shadow-2xl border-border/50 bg-card/80 backdrop-blur-sm z-10">
        <CardHeader className="space-y-3 pb-6 text-center">
          <div className="mx-auto w-12 h-12 bg-primary text-primary-foreground rounded-lg flex items-center justify-center mb-2 shadow-lg">
            <Briefcase size={24} />
          </div>
          <CardTitle className="text-3xl font-bold font-sans tracking-tight">Create Account</CardTitle>
          <CardDescription className="text-muted-foreground font-mono text-sm uppercase tracking-wider">
            Join ShiftWise
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="new_company" onValueChange={(v) => setMode(v as any)} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new_company" className="font-semibold"><Building className="w-4 h-4 mr-2"/> New Company</TabsTrigger>
              <TabsTrigger value="join_company" className="font-semibold"><KeyRound className="w-4 h-4 mr-2"/> Join Existing</TabsTrigger>
            </TabsList>
          </Tabs>

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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground/80">Work Email</FormLabel>
                    <FormControl>
                      <Input placeholder="name@company.com" {...field} className="bg-background/50 h-10" />
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
                      <Input type="password" placeholder="••••••••" {...field} className="bg-background/50 h-10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mode === "new_company" && (
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold text-foreground/80">Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corp" {...field} className="bg-background/50 h-10 border-primary/30 focus-visible:ring-primary/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {mode === "join_company" && (
                <FormField
                  control={form.control}
                  name="invitationToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold text-foreground/80">Invitation Token</FormLabel>
                      <FormControl>
                        <Input placeholder="Paste token here" {...field} className="bg-background/50 h-10 border-accent/50 focus-visible:ring-accent/50 font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <Button type="submit" className="w-full h-11 text-base font-bold tracking-wide mt-2" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Creating account..." : "Register"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border/30 pt-6 mt-2">
          <p className="text-sm text-muted-foreground">
            Already have an account? <Link href="/login" className="text-primary font-semibold hover:underline">Sign in here</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
