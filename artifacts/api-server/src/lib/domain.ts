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

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function isValidHostname(domain: string): boolean {
  return HOSTNAME_RE.test(domain);
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
