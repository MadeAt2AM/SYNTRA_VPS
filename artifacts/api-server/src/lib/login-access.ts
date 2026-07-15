export interface LoginAccessContext {
  userRole: string;
  userCompanyId: number | null;
  userCompanyStatus: string | null;
  customDomainCompanyId: number | null;
}

/**
 * Tenant accounts are valid only while their company is active. If the
 * request came through a verified custom domain, the account must belong to
 * that domain's company. Platform admins remain platform-host only.
 */
export function isLoginAllowed(context: LoginAccessContext): boolean {
  if (context.userRole === "platform_admin") {
    return context.customDomainCompanyId === null;
  }

  if (context.userCompanyId === null || context.userCompanyStatus !== "active") {
    return false;
  }

  return context.customDomainCompanyId === null
    || context.customDomainCompanyId === context.userCompanyId;
}
