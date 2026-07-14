import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { 
  CalendarDays, Users, Clock, Shield, BarChart3, 
  CheckCircle2, ArrowRight, Mail, Building, Phone, 
  ChevronDown, Star, Globe, Activity,
  Clock4, FileSpreadsheet, Lock, LayoutDashboard, XCircle, CheckCircle, Smartphone
} from "lucide-react";

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function FaqItem({ question, answer }: { question: string, answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-border/50">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="flex items-center justify-between w-full py-6 text-left font-bold text-lg focus:outline-none group"
      >
        <span className="group-hover:text-primary transition-colors">{question}</span>
        <div className={`flex-shrink-0 ml-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDown className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </button>
      <motion.div 
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        className="overflow-hidden"
      >
        <p className="pb-6 text-muted-foreground leading-relaxed pr-8">{answer}</p>
      </motion.div>
    </div>
  );
}

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

  const allFeatures = [
    "Visual drag-and-drop roster planning", "Real-time coverage & conflict alerts", "Template-based scheduling with reusable presets",
    "GPS-verified mobile time clock", "Leave & availability management", "Automated, validated payroll CSV exports",
    "Role-based access control", "Shift swaps, offers & replacements", "Custom domain for your team's login page",
  ];

  const faqs = [
    { q: "How long does implementation take?", a: "You can be fully operational within days. We provide a guided onboarding flow to help you import your team and set up your first roster." },
    { q: "Does SYNTRA integrate with our payroll system?", a: "Yes. SYNTRA generates validated CSV exports compatible with all major payroll providers, so shift hours, overtime, and leave are calculated correctly before export." },
    { q: "Is the mobile app available for all staff?", a: "Absolutely. All employees get access to our responsive mobile web app to check their shifts, submit leave requests, and clock in/out with GPS verification." },
    { q: "How do you handle scheduling conflicts?", a: "Our command center alerts you instantly if you attempt to schedule an employee who is on leave, unavailable, or exceeding their maximum contracted hours for the period." }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold text-sm shadow-sm">SY</div>
            <div>
              <div className="font-extrabold text-lg leading-none tracking-tight">SYNTRA</div>
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mt-0.5">Command Center</div>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors">Features</a>
              <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
              <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            </div>
            <div className="flex items-center gap-4">
              <a href="#enquire" className="hidden sm:inline-flex font-bold text-sm hover:text-primary transition-colors">Contact Sales</a>
              <Link 
                href="/login" 
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95"
              >
                Sign In <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-24 pb-32 overflow-hidden px-4 sm:px-6">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -z-10 h-[400px] w-[800px] rounded-full bg-primary/10 opacity-60 blur-[120px]"></div>
        
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <FadeIn>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary border border-primary/20 rounded-full px-5 py-2 text-sm font-bold mb-8 shadow-sm">
              <Shield className="h-4 w-4" /> Enterprise Workforce Management
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight mb-8 leading-[1.05]">
              Precision scheduling for <br className="hidden sm:block" />
              <span className="text-primary">mission-critical</span> operations.
            </h1>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="text-xl sm:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed font-medium">
              SYNTRA gives your team a command center for visual roster planning, leave management, time tracking, and automated payroll exports. Built for operators who can't afford mistakes.
            </p>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a 
                href="#enquire" 
                className="inline-flex h-14 w-full sm:w-auto items-center justify-center rounded-xl bg-primary px-10 text-lg font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:bg-primary/90 hover:-translate-y-1 active:translate-y-0"
              >
                Book a Demo
              </a>
              <Link 
                href="/login" 
                className="inline-flex h-14 w-full sm:w-auto items-center justify-center rounded-xl border-2 border-border bg-card px-10 text-lg font-bold shadow-sm transition-all hover:bg-muted hover:border-muted-foreground/20 hover:-translate-y-1 active:translate-y-0"
              >
                Sign In to Platform
              </Link>
            </div>
          </FadeIn>

          {/* Faux Dashboard UI */}
          <FadeIn delay={0.5} className="mt-20 relative mx-auto max-w-5xl">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10"></div>
            <div className="bg-card border border-border/60 rounded-t-2xl shadow-2xl overflow-hidden ring-1 ring-black/5">
              <div className="bg-muted/50 px-4 py-3 flex items-center gap-2 border-b border-border/50">
                <div className="w-3 h-3 rounded-full bg-destructive/70"></div>
                <div className="w-3 h-3 rounded-full bg-accent/70"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/70"></div>
              </div>
              <div className="p-6 sm:p-8 bg-card">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 opacity-60">
                   <div className="h-24 rounded-xl bg-muted border border-border/50"></div>
                   <div className="h-24 rounded-xl bg-muted border border-border/50"></div>
                   <div className="h-24 rounded-xl hidden sm:block bg-muted border border-border/50"></div>
                   <div className="h-24 rounded-xl hidden sm:block bg-muted border border-border/50"></div>
                </div>
                <div className="flex gap-6">
                   <div className="w-64 h-64 rounded-xl bg-muted border border-border/50 opacity-60 hidden md:block"></div>
                   <div className="flex-1 h-64 rounded-xl bg-muted border border-border/50 opacity-60"></div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>
      {/* Social Proof
      <section className="py-12 border-y border-border/50 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-center text-sm font-bold text-muted-foreground tracking-widest uppercase mb-8">Trusted by 500+ operations teams</p>
          <div className="flex flex-wrap justify-center gap-10 md:gap-20 opacity-50 grayscale transition-all hover:grayscale-0 hover:opacity-100 duration-500">
            {logos.map((logo, i) => (
               <div key={i} className="flex items-center gap-3 text-2xl font-extrabold tracking-tight">
                 {logo.icon} {logo.name}
               </div>
            ))}
          </div>
        </div>
      </section>
      */}

      {/* The Pivot (Comparison) */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">Ditch the spreadsheets and group chats.</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">Running a workforce on manual tools is a liability. It's time to upgrade to a system that works as hard as your team does.</p>
            </div>
          </FadeIn>
          
          <div className="grid md:grid-cols-2 gap-8 items-stretch">
            <FadeIn delay={0.1}>
              <div className="bg-destructive/5 border border-destructive/20 rounded-3xl p-8 sm:p-12 h-full">
                <div className="flex items-center gap-3 mb-8 text-destructive font-bold text-xl">
                  <XCircle className="h-7 w-7" /> The Old Way
                </div>
                <ul className="space-y-6">
                  {["Manual data entry across fragile spreadsheets", "Chaotic WhatsApp groups for shift swaps", "Guessing staff availability and leave balances", "Payroll errors from inaccurate, unverified timesheets"].map((item, i) => (
                    <li key={i} className="flex items-start gap-4 text-muted-foreground text-lg">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-destructive/50 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
            
            <FadeIn delay={0.2}>
              <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 sm:p-12 h-full relative overflow-hidden shadow-lg shadow-primary/5">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10 transform translate-x-1/2 -translate-y-1/2"></div>
                <div className="flex items-center gap-3 mb-8 text-primary font-bold text-xl">
                  <CheckCircle className="h-7 w-7" /> The SYNTRA Way
                </div>
                <ul className="space-y-6">
                  {["Single source of truth for all schedules", "Automated conflict & compliance checks", "Staff manage availability via dedicated app", "1-click validated payroll exports for finance"].map((item, i) => (
                    <li key={i} className="flex items-start gap-4 text-foreground font-medium text-lg">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section id="features" className="py-24 px-4 sm:px-6 bg-muted/30 border-y border-border/50">
        <div className="max-w-7xl mx-auto">
          <FadeIn>
            <div className="mb-16">
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">Everything you need to <br className="hidden sm:block"/>command your workforce.</h2>
              <p className="text-xl text-muted-foreground max-w-2xl">A complete suite of tools designed specifically for operations managers who value reliability over flash.</p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FadeIn delay={0.1} className="md:col-span-2">
              <div className="bg-card border border-border/60 rounded-[2rem] p-8 sm:p-12 h-full relative overflow-hidden group hover:border-primary/40 transition-colors duration-500 shadow-sm hover:shadow-md">
                <div className="relative z-10 max-w-lg">
                  <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-8 text-primary">
                    <CalendarDays className="h-7 w-7" />
                  </div>
                  <h3 className="text-3xl font-extrabold mb-4">Visual Roster Planning</h3>
                  <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                    Plan your entire team's week in minutes. Our drag-and-drop interface gives you a bird's-eye view of shifts, coverage gaps, and overtime risks before they happen.
                  </p>
                  <ul className="space-y-4">
                    {["Drag-and-drop visual interface", "Real-time coverage alerts", "Template-based scheduling"].map((f, i) => (
                        <li key={i} className="flex items-center gap-3 text-base font-bold">
                          <CheckCircle2 className="h-5 w-5 text-primary" /> {f}
                        </li>
                    ))}
                  </ul>
                </div>
                <div className="absolute -right-10 top-1/2 -translate-y-1/2 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none">
                  <LayoutDashboard className="w-[32rem] h-[32rem]" />
                </div>
              </div>
            </FadeIn>
            
            <FadeIn delay={0.2} className="col-span-1">
              <div className="bg-card border border-border/60 rounded-[2rem] p-8 sm:p-10 h-full relative overflow-hidden group hover:border-primary/40 transition-colors duration-500 shadow-sm hover:shadow-md flex flex-col">
                <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-8 text-primary">
                  <Clock className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-extrabold mb-4">Time & Attendance</h3>
                <p className="text-muted-foreground leading-relaxed mb-8 flex-1">
                  Turn any device into a time clock. Staff clock in via our mobile app with real-time location validation.
                </p>
                <div className="bg-background/80 p-4 rounded-xl border border-border/50 flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse" />
                  <span className="text-sm font-mono font-bold tracking-tight uppercase">GPS Verified</span>
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={0.3} className="col-span-1">
              <div className="bg-card border border-border/60 rounded-[2rem] p-8 sm:p-10 h-full relative overflow-hidden group hover:border-primary/40 transition-colors duration-500 shadow-sm hover:shadow-md flex flex-col">
                <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-8 text-primary">
                  <Users className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-extrabold mb-4">Leave Management</h3>
                <p className="text-muted-foreground leading-relaxed flex-1">
                  Staff request time off directly through the app. Managers approve with one click, and schedules update automatically.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={0.4} className="md:col-span-2">
              <div className="bg-card border border-border/60 rounded-[2rem] p-8 sm:p-12 h-full relative overflow-hidden group hover:border-primary/40 transition-colors duration-500 shadow-sm hover:shadow-md">
                <div className="relative z-10 max-w-lg">
                  <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-8 text-primary">
                    <FileSpreadsheet className="h-7 w-7" />
                  </div>
                  <h3 className="text-3xl font-extrabold mb-4">Automated Payroll Export</h3>
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    Stop manually calculating hours. SYNTRA cross-references scheduled shifts with actual clock-ins to generate validated, ready-to-import CSVs for your finance team.
                  </p>
                </div>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none">
                  <BarChart3 className="w-[28rem] h-[28rem]" />
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <FadeIn>
             <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-16 text-center">Built for people who run the floor.</h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "SYNTRA completely eliminated our scheduling conflicts. The payroll export alone saves us hours every single week.",
                role: "Operations Director",
              },
              {
                quote: "Finally, a workforce platform that feels like it was built for operators, not just HR. Fast, reliable, and incredibly precise.",
                role: "General Manager",
              },
              {
                quote: "Our staff love the mobile experience, and I love having a single source of truth for all time tracking and attendance.",
                role: "Regional Manager",
              }
            ].map((t, i) => (
              <FadeIn key={i} delay={0.1 * (i + 1)}>
                <div className="bg-muted/40 border border-border/50 rounded-3xl p-8 h-full flex flex-col relative">
                  <div className="flex gap-1 text-accent mb-6">
                    <Star className="h-5 w-5 fill-current" />
                    <Star className="h-5 w-5 fill-current" />
                    <Star className="h-5 w-5 fill-current" />
                    <Star className="h-5 w-5 fill-current" />
                    <Star className="h-5 w-5 fill-current" />
                  </div>
                  <p className="text-lg font-medium leading-relaxed mb-8 flex-1">"{t.quote}"</p>
                  <div className="text-sm font-semibold text-muted-foreground">{t.role}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 sm:px-6 bg-muted/30 border-y border-border/50">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">One plan. Every feature.</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">We tailor pricing to the size and needs of your operation — talk to our team for a quote.</p>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="bg-card rounded-[2rem] p-8 sm:p-12 border border-primary ring-1 ring-primary/20 shadow-xl">
              <h3 className="text-2xl font-extrabold mb-3">SYNTRA Platform</h3>
              <p className="text-muted-foreground mb-8 leading-relaxed">Everything you need to plan, run, and pay your workforce, in one command center.</p>
              <div className="text-4xl font-black tracking-tight mb-10">Talk to Sales</div>
              <ul className="grid sm:grid-cols-2 gap-4 mb-10">
                {allFeatures.map((f, j) => (
                    <li key={j} className="flex items-center gap-3 text-base font-medium">
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                      {f}
                    </li>
                ))}
              </ul>
              <a 
                href="#enquire" 
                className="w-full inline-flex h-14 items-center justify-center rounded-xl px-8 text-base font-bold shadow-sm shadow-primary/20 bg-primary text-primary-foreground transition-transform hover:-translate-y-1 hover:bg-primary/90"
              >
                Talk to Sales
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-12 text-center">Frequently asked questions</h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="border-t border-border/50">
              {faqs.map((faq, i) => (
                <FaqItem key={i} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Final CTA & Enquiry Form */}
      <section id="enquire" className="py-24 px-4 sm:px-6 relative overflow-hidden bg-secondary text-secondary-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(225,29,72,0.15),transparent_50%)]"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            <FadeIn>
              <div>
                <div className="inline-flex items-center gap-2 bg-secondary-foreground/10 text-secondary-foreground border border-secondary-foreground/20 rounded-full px-5 py-2 text-sm font-bold mb-8">
                  <Globe className="h-4 w-4" /> Available Worldwide
                </div>
                <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-8 leading-[1.1]">
                  Ready to take control of your operations?
                </h2>
                <p className="text-xl text-secondary-foreground/70 mb-10 max-w-lg leading-relaxed">
                  Schedule, track, and pay your team accurately every single week — with a platform built for operators who can't afford mistakes.
                </p>
                <div className="space-y-6">
                  {[
                    { icon: <Clock4 className="text-primary h-6 w-6"/>, title: "Setup in days, not months" },
                    { icon: <Lock className="text-primary h-6 w-6"/>, title: "Enterprise-grade security" },
                    { icon: <Activity className="text-primary h-6 w-6"/>, title: "Dedicated onboarding team" },
                  ].map((benefit, i) => (
                    <div key={i} className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-background/5 border border-background/10 flex items-center justify-center shadow-inner">
                        {benefit.icon}
                      </div>
                      <span className="font-bold text-lg">{benefit.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
            
            <FadeIn delay={0.2}>
              <div className="bg-card text-card-foreground rounded-[2rem] p-8 sm:p-12 shadow-2xl border border-border">
                <div className="mb-10">
                  <h3 className="text-3xl font-extrabold mb-3">Book a Demo</h3>
                  <p className="text-muted-foreground text-lg">Fill in your details and our team will be in touch within 1 business day.</p>
                </div>

                {submitted ? (
                  <div className="bg-muted/50 border border-border rounded-2xl p-12 text-center">
                    <div className="w-20 h-20 bg-green-500/20 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 className="w-10 h-10" />
                    </div>
                    <h3 className="text-2xl font-extrabold mb-3">Enquiry Received</h3>
                    <p className="text-muted-foreground text-lg">We'll be in touch shortly to get you set up.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold">Full Name *</label>
                        <Input
                          placeholder="Jane Smith"
                          value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          required
                          className="h-12 bg-background border-border focus-visible:ring-primary shadow-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold">Work Email *</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            type="email"
                            placeholder="jane@company.com"
                            className="h-12 pl-12 bg-background border-border focus-visible:ring-primary shadow-sm"
                            value={form.email}
                            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                            required
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold">Phone / WhatsApp *</label>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            type="tel"
                            placeholder="+1 555 000 0000"
                            className="h-12 pl-12 bg-background border-border focus-visible:ring-primary shadow-sm"
                            value={form.phone}
                            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold">Company</label>
                        <div className="relative">
                          <Building className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            placeholder="Acme Corporation"
                            className="h-12 pl-12 bg-background border-border focus-visible:ring-primary shadow-sm"
                            value={form.company}
                            onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold">How can we help? *</label>
                      <Textarea
                        placeholder="Tell us about your team size and what challenges you're facing..."
                        rows={4}
                        className="resize-none bg-background border-border focus-visible:ring-primary shadow-sm"
                        value={form.message}
                        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full h-14 font-bold text-lg shadow-xl shadow-primary/20 hover:-translate-y-0.5 transition-transform" disabled={submitting}>
                      {submitting ? "Sending..." : "Submit Enquiry"}
                    </Button>
                    <p className="text-sm text-center text-muted-foreground font-medium">No spam. We strictly use your details to follow up.</p>
                  </form>
                )}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 bg-background border-t border-border/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-xs shadow-sm">SY</div>
            <span className="font-extrabold text-lg tracking-tight">SYNTRA</span>
            <span className="text-muted-foreground hidden sm:inline">— Command Center for Workforce Operations</span>
          </div>
          <div className="flex gap-8 text-sm font-semibold text-muted-foreground">
             <Link href="/login" className="hover:text-foreground transition-colors">Platform Login</Link>
             <a href="#faq" className="hover:text-foreground transition-colors">Support</a>
             <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
          </div>
          <div className="text-sm text-muted-foreground font-medium">
            © {new Date().getFullYear()} SYNTRA. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
