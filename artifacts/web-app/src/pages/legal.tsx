import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronDown, Mail } from "lucide-react";

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) {
  return (
    <div
      className={className}
      style={{ animation: `fadeInUp 0.7s ease-out ${delay}s both` }}
    >
      {children}
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

const NAV = (
  <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 transition-all">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-3">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-xs shadow-sm">SY</div>
        <span className="font-extrabold text-lg tracking-tight">SYNTRA</span>
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase hidden sm:inline">— Workforce Operations</span>
      </Link>
      <div className="flex items-center gap-3">
        <Link href="/login" className="text-sm font-bold text-muted-foreground hover:text-foreground px-3 py-2">Login</Link>
        <Link href="/#pricing" className="text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg shadow-sm transition-colors">Get Started</Link>
      </div>
    </div>
  </header>
);

const FOOTER = (
  <footer className="py-12 px-4 sm:px-6 bg-background border-t border-border/50">
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-xs shadow-sm">SY</div>
        <span className="font-extrabold text-lg tracking-tight">SYNTRA</span>
        <span className="text-muted-foreground hidden sm:inline">— Command Center for Workforce Operations</span>
      </div>
      <div className="flex gap-8 text-sm font-semibold text-muted-foreground">
        <Link href="/login" className="hover:text-foreground transition-colors">Platform Login</Link>
        <Link href="/legal/terms" className="hover:text-foreground transition-colors">Terms</Link>
        <Link href="/legal/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
      </div>
      <div className="text-sm text-muted-foreground font-medium">
        © {new Date().getFullYear()} SYNTRA. All rights reserved.
      </div>
    </div>
  </footer>
);

export default function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const isTerms = kind === "terms";
  return (
    <div className="min-h-screen bg-background text-foreground">
      {NAV}

      <section className="pt-24 pb-12 px-4 sm:px-6 border-b border-border/50 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="text-sm font-bold text-primary uppercase tracking-wider mb-3">Legal</div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              {isTerms ? "Terms & Conditions" : "Privacy Policy"}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              {isTerms
                ? "The agreement governing your use of SYNTRA. Plain English, no surprises."
                : "How we collect, use, store, and protect your data. Written to be read."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={isTerms ? "/legal/privacy" : "/legal/terms"}
                className="inline-flex items-center text-sm font-bold text-primary hover:underline"
              >
                Read {isTerms ? "Privacy Policy" : "Terms & Conditions"} →
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-6">
              Last updated: {new Date().toLocaleDateString("en-SG", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </FadeIn>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto prose prose-slate dark:prose-invert">
          {isTerms ? <TermsBody /> : <PrivacyBody />}
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 bg-muted/30 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-4">Questions?</h2>
            <p className="text-muted-foreground mb-8 max-w-2xl">
              We try to keep these documents readable. If anything's unclear or you want to exercise any of the rights described above, contact us.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-1 max-w-md gap-4">
              <a href="mailto:legal@madeat2am.in" className="flex items-center gap-3 p-4 rounded-xl border border-border bg-background hover:border-primary transition-colors">
                <Mail className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-xs font-bold text-muted-foreground uppercase">Email</div>
                  <div className="font-semibold text-sm">legal@madeat2am.in</div>
                </div>
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      {FOOTER}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-extrabold tracking-tight mt-12 mb-4 text-foreground">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-bold tracking-tight mt-8 mb-3 text-foreground">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-base leading-relaxed text-muted-foreground mb-4">{children}</p>;
}
function UL({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-6 space-y-2 mb-6 text-muted-foreground">
      {items.map((i, idx) => <li key={idx} className="leading-relaxed">{i}</li>)}
    </ul>
  );
}

function TermsBody() {
  return (
    <>
      <H2>1. Agreement</H2>
      <P>These Terms & Conditions govern your use of SYNTRA. By creating an account or using the platform, you agree to these terms.</P>

      <H2>2. The service</H2>
      <P>SYNTRA provides scheduling, shift management, time tracking, leave management, and reporting tools for small and medium-sized teams. Features are described at <Link href="/" className="text-primary hover:underline">syntra.terrybot.top</Link> and may evolve over time.</P>

      <H2>3. Accounts</H2>
      <UL items={[
        "You must provide a valid email address when registering.",
        "You are responsible for keeping your password secure. Use a unique password and don't share your account.",
        "Accounts created via invitation belong to the inviting company. The company admin can deactivate or remove your access at any time.",
        "Platform administrator accounts have cross-company access and are reserved for SYNTRA operators.",
      ]} />

      <H2>4. Acceptable use</H2>
      <P>You agree not to:</P>
      <UL items={[
        "Reverse-engineer, decompile, or attempt to extract the source code of the platform.",
        "Upload content that is unlawful, infringing, malicious, or designed to disrupt the service.",
        "Use the platform to send unsolicited email or spam to other users.",
        "Attempt to access other tenants' data without authorisation.",
        "Use the platform in violation of applicable employment, privacy, or data-protection laws (including the Singapore Personal Data Protection Act 2012 if you are based in Singapore).",
      ]} />

      <H2>5. Your data</H2>
      <P>You retain ownership of the data you submit to SYNTRA (employee names, schedules, etc.). We process this data only to provide the service. See our <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link> for details on storage, retention, and your rights.</P>
      <P>You may export your data at any time via the platform's CSV export features. On account termination, we will delete your data within 30 days unless retention is required by law.</P>

      <H2>6. Fees and payment</H2>
      <P>Subscription fees, if applicable, are described on our pricing page and agreed at the time of subscription. Fees are non-refundable except where required by law. We may change pricing with 30 days' notice.</P>

      <H2>7. Service availability</H2>
      <P>We aim for high availability but do not guarantee uninterrupted access. We may perform maintenance, which we'll announce in advance where reasonably possible. We are not liable for losses caused by downtime beyond our reasonable control.</P>

      <H2>8. Intellectual property</H2>
      <P>The SYNTRA brand and platform design are owned by the SYNTRA operator. You may not copy or redistribute them without written permission.</P>

      <H2>9. Termination</H2>
      <P>You may stop using SYNTRA at any time. We may suspend or terminate accounts that violate these terms. On termination, your right to use the platform ends immediately.</P>

      <H2>10. Disclaimers and liability</H2>
      <P>To the maximum extent permitted by law, SYNTRA is provided "as is" without warranties of any kind. We are not liable for indirect, incidental, or consequential damages arising from your use of the platform. Our total liability is limited to the fees paid in the 12 months preceding the claim.</P>

      <H2>11. Changes to these terms</H2>
      <P>We may update these terms. Material changes will be announced via email or in-app notification at least 14 days before they take effect. Continued use after the effective date constitutes acceptance.</P>

      <H2>12. Governing law</H2>
      <P>These terms are governed by the laws of Singapore. Any disputes will be resolved in the courts of Singapore.</P>

      <H2>13. Contact</H2>
      <P>Questions about these terms? Email <a href="mailto:legal@madeat2am.in" className="text-primary hover:underline">legal@madeat2am.in</a>.</P>
    </>
  );
}

function PrivacyBody() {
  return (
    <>
      <H2>1. What this covers</H2>
      <P>This Privacy Policy explains how personal data is collected, used, stored, and protected when you use SYNTRA. It applies to the platform at syntra.terrybot.top and any custom domains operated by SYNTRA.</P>

      <H2>2. Data we collect</H2>
      <H3>Account data</H3>
      <P>Name, email address, password (stored as a bcrypt hash — never in plain text), phone number (optional), and role within your company.</P>
      <H3>Usage data</H3>
      <P>Shifts, time logs, leave requests, availability preferences, workplaces (with GPS coordinates if you choose to add them), and any other operational data you create in the platform.</P>
      <H3>Technical data</H3>
      <P>IP addresses, user-agent strings, and request metadata in server logs. We retain these for up to 30 days for security and debugging.</P>

      <H2>3. How we use your data</H2>
      <UL items={[
        "To provide and operate the SYNTRA platform.",
        "To send you transactional emails (invitations, password resets, shift notifications) — only as part of platform features.",
        "To send enquiry-form follow-ups when you contact us via the website.",
        "To detect and prevent abuse, fraud, and security incidents.",
        "To comply with legal obligations.",
      ]} />
      <P>We do not sell your data. We do not use your data for advertising.</P>

      <H2>4. Legal basis (GDPR)</H2>
      <P>If you are in the European Economic Area, we process your data under one of the following legal bases:</P>
      <UL items={[
        "Performance of a contract — to provide the SYNTRA service you signed up for.",
        "Legitimate interests — to keep the platform secure and prevent abuse.",
        "Consent — for optional features like marketing communications (you can withdraw consent at any time).",
        "Legal obligation — when we must retain data to comply with applicable law.",
      ]} />

      <H2>5. Where your data is stored</H2>
      <P>Primary data is stored on PostgreSQL databases hosted on our infrastructure in Helsinki, Finland (Hetzner Online). Backups are stored in the same region. By using SYNTRA, you understand your data may be transferred to and processed in this location.</P>

      <H2>6. Who we share data with</H2>
      <P>We do not sell or rent your data. We share it only with:</P>
      <UL items={[
        "Other users within your company — managers and admins see staff data as part of operating the platform.",
        "Email delivery providers (SMTP) — for transactional emails. These providers receive only the data needed to deliver the email (recipient, subject, body).",
        "Cloud infrastructure providers — who host our servers and databases under data-processing agreements.",
        "Law enforcement — only when legally compelled.",
      ]} />

      <H2>7. Cookies and local storage</H2>
      <P>SYNTRA uses your browser's <code className="bg-muted px-1 rounded">localStorage</code> to store your authentication token. We do not use third-party tracking cookies. We do not use analytics services that track you across sites.</P>

      <H2>8. Data retention</H2>
      <UL items={[
        "Account data — while your account is active. On deletion, removed within 30 days.",
        "Operational data (shifts, time logs, etc.) — retained while your account is active. You may export or delete at any time.",
        "Server logs — 30 days.",
        "Backups — up to 90 days, then permanently deleted.",
      ]} />

      <H2>9. Your rights</H2>
      <P>You have the right to:</P>
      <UL items={[
        "Access the personal data we hold about you.",
        "Correct inaccurate data.",
        "Delete your account and associated data (subject to legal retention requirements).",
        "Export your data in a portable format (CSV).",
        "Object to processing or withdraw consent where applicable.",
        "Lodge a complaint with a data protection authority (e.g. the PDPC in Singapore or your local EU DPA).",
      ]} />
      <P>To exercise any of these rights, email <a href="mailto:privacy@madeat2am.in" className="text-primary hover:underline">privacy@madeat2am.in</a>. We respond within 30 days.</P>

      <H2>10. Security</H2>
      <P>We protect your data with industry-standard measures including:</P>
      <UL items={[
        "Bcrypt password hashing (cost factor 12).",
        "JWT-based authentication with a server-side signing secret.",
        "TLS 1.3 for all data in transit.",
        "PostgreSQL row-level access control based on company membership.",
        "Rate-limited authentication endpoints to prevent brute-force attacks.",
        "Security headers (Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).",
        "Containerised deployment with isolated networks and minimal host exposure.",
      ]} />
      <P>If we discover a security breach affecting your personal data, we'll notify you and relevant authorities within 72 hours where required.</P>

      <H2>11. International transfers</H2>
      <P>If you are outside our hosting region, your data is transferred to and processed in our hosting region. We rely on standard contractual clauses and equivalent safeguards for any onward transfers.</P>

      <H2>12. Children</H2>
      <P>SYNTRA is not directed at children under 16, and we do not knowingly collect personal data from children.</P>

      <H2>13. Changes to this policy</H2>
      <P>We may update this Privacy Policy. Material changes will be announced via email or in-app notification at least 14 days before they take effect. The "Last updated" date at the top of this page reflects the current version.</P>

      <H2>14. Contact</H2>
      <P>For any privacy questions or to exercise your rights, email <a href="mailto:privacy@madeat2am.in" className="text-primary hover:underline">privacy@madeat2am.in</a>.</P>
    </>
  );
}