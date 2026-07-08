import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail } from "lucide-react";

const schema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: (body as any).error ?? "Something went wrong.", variant: "destructive" });
      } else {
        setSubmitted(true);
      }
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />

      <Link href="/login" className="z-10 mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={14} /> Back to sign in
      </Link>

      <Card className="w-full max-w-md shadow-2xl border-border/50 bg-card/80 backdrop-blur-sm z-10">
        <CardHeader className="space-y-3 pb-6 text-center">
          <div className="mx-auto w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center mb-2 shadow-lg">
            <Mail size={22} />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Reset Password</CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Enter your work email and we&apos;ll send you a reset link.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {submitted ? (
            <div className="text-center space-y-3 py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <Mail size={24} className="text-emerald-500" />
              </div>
              <p className="font-semibold text-foreground">Check your inbox</p>
              <p className="text-sm text-muted-foreground">
                If an account with that email exists, a reset link has been sent. Check your spam folder if you don&apos;t see it within a few minutes.
              </p>
            </div>
          ) : (
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
                <Button type="submit" className="w-full h-11 text-base font-bold tracking-wide" disabled={loading}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>

        <CardFooter className="border-t border-border/30 pt-5 mt-2 justify-center">
          <Link href="/login" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            Remember your password? <span className="font-semibold text-primary">Sign in</span>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
