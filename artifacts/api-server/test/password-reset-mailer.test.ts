import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveResetMailer } from "../src/lib/password-reset-mailer";

const envFull: any = {
  APP_BASE_URL: "https://syntra.terrybot.top",
  CONTACT_SMTP_HOST: "mail.cyberslide.net",
  CONTACT_SMTP_PORT: "587",
  CONTACT_SMTP_USER: "support@madeat2am.in",
  CONTACT_SMTP_PASS: "x",
  CONTACT_SMTP_FROM: "SYNTRA Enquiries <support@madeat2am.in>",
  CONTACT_EMAIL_FROM: "SYNTRA Platform <platform@madeat2am.in>",
};

const envPlatform: any = {
  APP_BASE_URL: "https://syntra.terrybot.top",
};

describe("resolveResetMailer", () => {
  it("uses platform_settings SMTP when present for a platform_admin", () => {
    const r = resolveResetMailer({
      userRole: "platform_admin",
      userCompanyId: null,
      env: envPlatform,
      platformSettings: {
        smtpConfig: {
          host: "smtp.sendgrid.net",
          port: 587,
          secure: false,
          user: "apikey",
          pass: "SG.pwd",
          from: "noreply@madeat2am.in",
        },
        contactEmailFrom: "SYNTRA Platform <platform@madeat2am.in>",
      },
    });
    assert.equal(r.kind, "platform");
    assert.equal(r.smtp?.host, "smtp.sendgrid.net");
    assert.equal(r.smtp?.user, "apikey");
    assert.equal(r.smtp?.from, "SYNTRA Platform <platform@madeat2am.in>");
    assert.equal(r.origin, "https://syntra.terrybot.top");
  });

  it("falls back to env SMTP when platform_settings has no SMTP", () => {
    const r = resolveResetMailer({
      userRole: "platform_admin",
      userCompanyId: null,
      env: envFull,
      platformSettings: { smtpConfig: null, contactEmailFrom: null },
    });
    assert.equal(r.kind, "platform");
    assert.equal(r.smtp?.host, "mail.cyberslide.net");
    assert.equal(r.smtp?.from, "SYNTRA Platform <platform@madeat2am.in>");
  });

  it("returns kind=none with no smtp when nothing is configured", () => {
    const r = resolveResetMailer({
      userRole: "platform_admin",
      userCompanyId: null,
      env: envPlatform,
      platformSettings: null,
    });
    assert.equal(r.kind, "none");
    assert.equal(r.smtp, null);
  });

  it("treats a tenant with companyId as the tenant branch", () => {
    const r = resolveResetMailer({
      userRole: "admin",
      userCompanyId: 19,
      env: envPlatform,
      platformSettings: { smtpConfig: { host: "x", port: 587, secure: false, user: "u", pass: "p", from: "a" }, contactEmailFrom: null },
    });
    assert.equal(r.kind, "tenant");
    assert.equal(r.smtp, null);
    assert.equal(r.origin, "https://syntra.terrybot.top");
  });

  it("uses APP_BASE_URL when present and falls back to REPLIT_DOMAINS", () => {
    const a = resolveResetMailer({
      userRole: "platform_admin",
      userCompanyId: null,
      env: { APP_BASE_URL: "https://syntra.terrybot.top/" },
      platformSettings: null,
    });
    assert.equal(a.origin, "https://syntra.terrybot.top");

    const b = resolveResetMailer({
      userRole: "platform_admin",
      userCompanyId: null,
      env: { REPLIT_DOMAINS: "syntra.terrybot.top,syntra.cyberslide.net" },
      platformSettings: null,
    });
    assert.equal(b.origin, "https://syntra.terrybot.top");

    const c = resolveResetMailer({
      userRole: "platform_admin",
      userCompanyId: null,
      env: {},
      platformSettings: null,
    });
    assert.equal(c.origin, "http://localhost:8080");
  });
});
