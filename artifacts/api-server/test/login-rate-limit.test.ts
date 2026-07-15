import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loginRateLimitKey } from "../src/middlewares/rate-limit";

describe("loginRateLimitKey", () => {
  it("keys account attempts by normalized email", () => {
    assert.equal(loginRateLimitKey("  Manager@Demo.com ", "203.0.113.10"), "manager@demo.com");
  });

  it("falls back to the client IP when email is unavailable", () => {
    assert.equal(loginRateLimitKey(undefined, "203.0.113.10"), "ip:203.0.113.10");
  });
});
