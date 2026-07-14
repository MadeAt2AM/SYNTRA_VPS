/**
 * Public, unauthenticated endpoints that the frontend needs before a user
 * has logged in — currently just per-domain branding lookup so a company's
 * custom domain shows their own name/logo on the login screen instead of
 * generic SYNTRA branding.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { companies } from "@workspace/db";
import { eq } from "drizzle-orm";
import { normalizeDomain } from "../lib/domain";

const router: IRouter = Router();

// GET /api/public/branding?host=<hostname>
// Falls back to the request's own Host header when `host` isn't provided,
// so the frontend can simply call this with no params from the browser.
router.get("/branding", async (req, res) => {
  const rawHost = typeof req.query["host"] === "string" ? req.query["host"] : req.hostname;
  const host = normalizeDomain(rawHost || "");

  if (!host) {
    res.json({ branded: false });
    return;
  }

  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      logoUrl: companies.logoUrl,
      logoText: companies.logoText,
      domainStatus: companies.domainStatus,
    })
    .from(companies)
    .where(eq(companies.customDomain, host))
    .limit(1);

  // Only brand the login experience once the domain is verified so a
  // misconfigured/unclaimed record can't spoof another company's page.
  if (!company || company.domainStatus !== "verified") {
    res.json({ branded: false });
    return;
  }

  res.json({
    branded: true,
    companyId: company.id,
    name: company.name,
    logoUrl: company.logoUrl,
    logoText: company.logoText,
  });
});

export default router;
