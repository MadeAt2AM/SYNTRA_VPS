/**
 * Custom domain support.
 *
 * Companies can point a CNAME (preferred) or A record at our platform host
 * so that their staff log in from their own domain (e.g. login.acme.com)
 * instead of the shared SYNTRA domain. We store the requested domain plus a
 * verification status, and actually check DNS resolution so "verified"
 * means the record was observed pointing at us.
 */
import dns from "node:dns/promises";
import * as fs from "node:fs";

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function isValidHostname(domain: string): boolean {
  return HOSTNAME_RE.test(domain);
}

/**
 * Verified-custom-domain hostnames this API knows about. Sources (in order):
 *   1. `SYNRA_CUSTOM_DOMAIN_HOSTS` env var (comma-separated, used in tests/Dockerfiles)
 *   2. `/srv/secrets/syntra-custom-domains` file (one hostname per line, used on VPS)
 *   3. hard-coded fallback (currently empty — operator must opt-in)
 *
 * The list is consumed by Caddy (via the deploy script writing a sidecar
 * file), the CORS allowlist, and the auth redirect logic, so all three stay
 * in sync via this single helper.
 */
export function getCustomDomainHosts(): string[] {
  const seen = new Set<string>();
  const fromEnv = process.env["SYNRA_CUSTOM_DOMAIN_HOSTS"];
  if (fromEnv) {
    for (const h of fromEnv.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (isValidHostname(h)) seen.add(h.toLowerCase());
    }
  }
  // Best-effort read of the VPS-side hostnames file. Kept tolerant so the
  // helper works during local development (no secrets file present).
  try {
    const buf = fs.readFileSync("/srv/secrets/syntra-custom-domains", "utf8");
    for (const line of buf.split(/\r?\n/)) {
      const h = line.trim();
      if (h && !h.startsWith("#") && isValidHostname(h)) seen.add(h.toLowerCase());
    }
  } catch {
    /* file absent or unreadable — fall through */
  }
  return Array.from(seen);
}

/**
 * True iff `host` is a verified-custom-domain hostname this deployment is
 * configured to serve. Used by the auth flow to decide whether a post-login
 * cross-origin redirect is permitted.
 */
export function isKnownCustomDomain(host: string): boolean {
  const norm = normalizeDomain(host);
  if (!norm) return false;
  return getCustomDomainHosts().includes(norm);
}

/**
 * Build an absolute `https://<host><path>` URL on the verified custom domain,
 * but ONLY when `host` is in the allowlist returned by `getCustomDomainHosts()`.
 * Returns `null` for unknown hosts so callers can short-circuit the redirect
 * (defense against open-redirect: a bogus `customDomain` value in the DB can
 * never lead to an arbitrary redirect).
 */
export function buildCustomDomainUrl(host: string, path = "/"): string | null {
  if (!isKnownCustomDomain(host)) return null;
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `https://${normalizeDomain(host)}${safePath}`;
}

/** The platform host(s) a customer's DNS record must resolve to. */
export function getPlatformTargets(): string[] {
  const domains = process.env["REPLIT_DOMAINS"];
  const targets = new Set<string>();
  if (domains) {
    for (const d of domains.split(",").map((d) => d.trim()).filter(Boolean)) {
      targets.add(d.toLowerCase());
    }
  }
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) targets.add(devDomain.toLowerCase());
  return Array.from(targets);
}

export interface DomainCheckResult {
  verified: boolean;
  method: "cname" | "a" | "none";
  detail: string;
}

/**
 * Checks whether `domain` currently resolves (via CNAME or A) to one of our
 * platform hosts. Best-effort: DNS lookups can fail transiently, so callers
 * should treat a failed check as "not yet verified" rather than an error.
 */
export async function checkDomainDns(domain: string): Promise<DomainCheckResult> {
  const targets = getPlatformTargets();
  if (targets.length === 0) {
    return { verified: false, method: "none", detail: "Platform host is not configured yet." };
  }

  try {
    const cnames = await dns.resolveCname(domain);
    const match = cnames.find((c) => targets.includes(c.toLowerCase().replace(/\.$/, "")));
    if (match) {
      return { verified: true, method: "cname", detail: `CNAME resolves to ${match}` };
    }
    if (cnames.length > 0) {
      return {
        verified: false,
        method: "cname",
        detail: `CNAME points to ${cnames.join(", ")}, expected ${targets[0]}`,
      };
    }
  } catch {
    // No CNAME record — fall through to A-record check.
  }

  try {
    const targetAddrs = new Set<string>();
    for (const t of targets) {
      try {
        (await dns.resolve4(t)).forEach((a) => targetAddrs.add(a));
      } catch {
        // ignore — target may only be reachable via CNAME
      }
    }
    const addrs = await dns.resolve4(domain);
    const match = addrs.find((a) => targetAddrs.has(a));
    if (match) {
      return { verified: true, method: "a", detail: `A record resolves to ${match}` };
    }
    if (addrs.length > 0) {
      return { verified: false, method: "a", detail: `A record points to ${addrs.join(", ")}, not our platform` };
    }
  } catch {
    // no A record either
  }

  return { verified: false, method: "none", detail: "No DNS record found for this domain yet." };
}
