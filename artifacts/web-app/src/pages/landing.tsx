import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Users, Clock, Shield, BarChart3, Smartphone, CheckCircle2, ArrowRight, Mail, Building, Phone } from "lucide-react";

export default function LandingPage() {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone || !form.message) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSubmitted(true);
        toast({ title: "Enquiry sent", description: "We'll be in touch within 1 business day." });
      }
    } catch {
      toast({ title: "Error", description: "Please try again later.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm">SY</div>
            <div>
              <div className="font-bold text-base leading-none tracking-tight">SYNTRA</div>
              <div className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">Workforce Mgmt</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="#enquire" className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</a>
            <Link href="/login">
              <Button size="sm" className="font-semibold">Sign In <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-20 px-4 sm:px-6">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[50vh] bg-primary/8 rounded-full blur-[120px]" />
        </div>
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary border border-primary/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-8">
            <Shield size={14} /> Enterprise Workforce Management
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6 leading-[1.1]">
            Schedule smarter.<br />
            <span className="text-primary">Manage better.</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            SYNTRA gives your team everything they need — visual roster planning, leave management, time tracking, and payroll exports — all in one platform.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#enquire">
              <Button size="lg" className="font-bold px-8 h-12 text-base w-full sm:w-auto">
                <Mail className="mr-2 h-4 w-4" /> Get in Touch
              </Button>
            </a>
            <Link href="/login">
              <Button size="lg" variant="outline" className="font-bold px-8 h-12 text-base w-full sm:w-auto">
                Sign In to Platform
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Everything you need to run your workforce</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Built for operations managers, team leads, and HR teams who need reliable, easy-to-use tools.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <CalendarDays className="h-6 w-6 text-primary" />,
                title: "Visual Roster Planning",
                desc: "See your whole team's week at a glance. Drag-and-drop style grid lets you plan everyone's shifts in one screen.",
              },
              {
                icon: <Users className="h-6 w-6 text-primary" />,
                title: "Leave & Availability",
                desc: "Staff submit availability and leave requests. Managers get instant conflict warnings when scheduling.",
              },
              {
                icon: <Clock className="h-6 w-6 text-primary" />,
                title: "Time Tracking",
                desc: "Clock in/out from any device. Managers review and validate hours with a full audit trail.",
              },
              {
                icon: <BarChart3 className="h-6 w-6 text-primary" />,
                title: "Payroll Export",
                desc: "Export weekly or monthly payroll CSVs for your accounts team. Includes validated hours and pay estimates.",
              },
              {
                icon: <Smartphone className="h-6 w-6 text-primary" />,
                title: "Mobile Friendly",
                desc: "Fully responsive on any device. Staff can check their schedule, submit leave, and clock in from their phone.",
              },
              {
                icon: <Shield className="h-6 w-6 text-primary" />,
                title: "Role-Based Access",
                desc: "Platform admins, company owners, managers, and employees each see exactly what they need — nothing more.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-card border border-border/50 rounded-xl p-6 hover:shadow-md transition-shadow">
                <div className="w-11 h-11 bg-primary/10 rounded-lg flex items-center justify-center mb-4">{f.icon}</div>
                <h3 className="font-bold text-base mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">How SYNTRA works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Enquire", desc: "Contact us to get your organisation set up on the SYNTRA platform." },
              { step: "02", title: "Onboard", desc: "We create your company workspace and owner account. Invite your team via email." },
              { step: "03", title: "Manage", desc: "Start scheduling, tracking time, and managing leave from day one." },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center text-primary font-bold text-xl mx-auto mb-4">{s.step}</div>
                <h3 className="font-bold text-base mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Enquiry Form */}
      <section id="enquire" className="py-20 px-4 sm:px-6 bg-muted/30">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Get Started with SYNTRA</h2>
            <p className="text-muted-foreground">Fill in the form below and our team will be in touch within 1 business day.</p>
          </div>

          {submitted ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center">
              <CheckCircle2 className="w-14 h-14 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Thanks for your enquiry!</h3>
              <p className="text-muted-foreground">We'll be in touch within 1 business day to get you set up.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-card border border-border/50 rounded-xl p-6 sm:p-8 shadow-sm space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Full Name *</label>
                  <Input
                    placeholder="Jane Smith"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Work Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="jane@company.com"
                      className="pl-9"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Phone / WhatsApp *</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      placeholder="+1 555 000 0000"
                      className="pl-9"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Company / Organisation</label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Acme Corporation"
                      className="pl-9"
                      value={form.company}
                      onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Message *</label>
                <Textarea
                  placeholder="Tell us about your organisation and what you're looking for..."
                  rows={4}
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  required
                />
              </div>
              <Button type="submit" className="w-full h-11 font-bold text-base" disabled={submitting}>
                {submitting ? "Sending..." : "Send Enquiry"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">No spam. We'll only use your details to follow up on this enquiry.</p>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 border-t border-border/50">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold text-xs">SY</div>
            <span className="font-semibold text-foreground">SYNTRA</span>
            <span>— Workforce Management Platform</span>
          </div>
          <div>© {new Date().getFullYear()} SYNTRA. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
