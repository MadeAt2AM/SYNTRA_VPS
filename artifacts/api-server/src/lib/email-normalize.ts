/**
 * Email normalization for SYNTRA.
 *
 * All email lookups should go through these helpers so that
 * `User@Acme.com` and `user@acme.com` always resolve to the same account,
 * regardless of how the caller cased the input or how the DB stored it.
 *
 * Two-layer defense:
 *  1. Lowercase the input value on the application side (cheap, predictable).
 *  2. Compare with `lower(email_column) = $1` on the database side (handles
 *     legacy rows that may have been inserted before normalization).
 *
 * Use `emailEq(column, value)` in WHERE clauses and `normalizeEmail(value)`
 * for any value you're about to INSERT.
 */
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Returns a SQL fragment that matches the given column against the supplied
 * email, treating both sides as case-insensitive.
 *
 * Example:
 *   .where(emailEq(users.email, req.body.email))
 */
export function emailEq(column: AnyPgColumn, value: string) {
  const normalized = normalizeEmail(value);
  return sql`lower(${column}) = ${normalized}`;
}

/**
 * Lowercase + trim an email for storage or comparison. We deliberately
 * do NOT touch the local-part (the bit before `@`) — RFC 5321 allows
 * case-sensitive local parts in theory, but in practice every major
 * provider treats them as case-insensitive, and we want one identity per
 * human. Domain part is lowercased as per DNS convention.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}