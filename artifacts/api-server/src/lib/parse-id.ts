import { Response } from "express";

/**
 * Safely parse a route param as a positive integer.
 * Accepts string | string[] | undefined (covers all Express param shapes).
 * Returns the number, or sends 400 and returns null.
 */
export function parseId(
  raw: unknown,
  res: Response,
  name = "id",
): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    res.status(400).json({ error: `Invalid ${name}: must be a positive integer` });
    return null;
  }
  return n;
}
