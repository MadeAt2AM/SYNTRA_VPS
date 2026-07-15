import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLoginAllowed } from "../src/lib/login-access";

describe("isLoginAllowed", () => {
  it("keeps platform admins on the platform host", () => {
    assert.equal(isLoginAllowed({
      userRole: "platform_admin",
      userCompanyId: null,
      userCompanyStatus: null,
      customDomainCompanyId: null,
    }), true);
  });

  it("rejects platform admins on a company custom domain", () => {
    assert.equal(isLoginAllowed({
      userRole: "platform_admin",
      userCompanyId: null,
      userCompanyStatus: null,
      customDomainCompanyId: 19,
    }), false);
  });

  it("allows an active tenant user on the platform host", () => {
    assert.equal(isLoginAllowed({
      userRole: "employee",
      userCompanyId: 19,
      userCompanyStatus: "active",
      customDomainCompanyId: null,
    }), true);
  });

  it("allows an active tenant user on their company's custom domain", () => {
    assert.equal(isLoginAllowed({
      userRole: "employee",
      userCompanyId: 19,
      userCompanyStatus: "active",
      customDomainCompanyId: 19,
    }), true);
  });

  it("rejects a tenant user on another company's custom domain", () => {
    assert.equal(isLoginAllowed({
      userRole: "employee",
      userCompanyId: 1,
      userCompanyStatus: "active",
      customDomainCompanyId: 19,
    }), false);
  });

  it("rejects a user whose company is inactive", () => {
    assert.equal(isLoginAllowed({
      userRole: "admin",
      userCompanyId: 18,
      userCompanyStatus: "inactive",
      customDomainCompanyId: null,
    }), false);
  });

  it("rejects a tenant user without a company", () => {
    assert.equal(isLoginAllowed({
      userRole: "employee",
      userCompanyId: null,
      userCompanyStatus: null,
      customDomainCompanyId: null,
    }), false);
  });
});
