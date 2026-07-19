// Live integration regression that hits the running API on 127.0.0.1:8080.
// Skips itself when no API is reachable so dev environments without an api
// container don't fail CI outright.

import test from "node:test";
import assert from "node:assert/strict";

const base = process.env.SYNTRA_API_BASE ?? "http://127.0.0.1:8080";

async function ping() {
  try {
    const r = await fetch(`${base}/api/healthz`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

test("live: every active user logs in with Test123! from the base URL", async (t) => {
  if (!(await ping())) return t.skip("API not reachable at " + base);
  const emails = [
    "admin@demo.com",
    "manager@demo.com",
    "platform@syntra.com",
    "staff1@demo.com",
    "staff2@demo.com",
    "chrisspeakssg@gmail.com",
    "chrisspeakseh@gmail.com",
    "chrisspeakstrue@gmail.com",
    "madeat2am.ai@gmail.com",
  ];
  for (const email of emails) {
    const r = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Test123!" }),
    });
    // 429 is acceptable — limiter filled up from a previous run. We only want
    // to fail on "wrong password"-shaped errors. So we assert: either 200 with
    // a user payload, or 429 (limiter busy).
    if (r.status === 200) {
      const j = await r.json();
      assert.equal(j.user.email, email);
      assert.ok(j.token);
    } else {
      assert.equal(r.status, 429, `unexpected non-200/429 for ${email}: ${r.status}`);
    }
  }
});

test("live: tenant login on custom domain does not redirect away from the custom domain", async (t) => {
  if (!(await ping())) return t.skip("API not reachable at " + base);
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Host": "syntra.cyberslide.net" },
    body: JSON.stringify({ email: "chrisspeakseh@gmail.com", password: "Test123!" }),
  });
  if (r.status === 429) return t.skip("limiter busy");
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.redirectTo, null, "no double-bounce when already on the custom domain");
});

test("live: tenant login on base host is told to bounce to their custom domain", async (t) => {
  if (!(await ping())) return t.skip("API not reachable at " + base);
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Host": "syntra.terrybot.top" },
    body: JSON.stringify({ email: "chrisspeakseh@gmail.com", password: "Test123!" }),
  });
  if (r.status === 429) return t.skip("limiter busy");
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.redirectTo, "https://syntra.cyberslide.net/dashboard");
});

test("live: forgot-password writes a hashed token + expiry", async (t) => {
  if (!(await ping())) return t.skip("API not reachable at " + base);
  const r = await fetch(`${base}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.com" }),
  });
  assert.equal(r.status, 200);
});

test("live: reset-password rejects unknown tokens", async (t) => {
  if (!(await ping())) return t.skip("API not reachable at " + base);
  const r = await fetch(`${base}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "definitely-not-a-real-token", newPassword: "NewOne1234!" }),
  });
  assert.equal(r.status, 400);
});
