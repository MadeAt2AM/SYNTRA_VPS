/**
 * Roster CSV export and import utilities.
 * Export: vertical staff names, horizontal dates.
 * Import: parse CSV back into shift objects.
 */

import { format, addDays, startOfMonth, getDaysInMonth } from "date-fns";

export interface RosterRow {
  employeeName: string;
  employeeId?: number;
  [dateStr: string]: string | number | undefined;
}

/** Build the list of date strings for a month */
export function getMonthDates(year: number, month: number): string[] {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const days = getDaysInMonth(start);
  return Array.from({ length: days }, (_, i) =>
    format(addDays(start, i), "yyyy-MM-dd")
  );
}

/** Format a shift for a CSV cell: "09:00-17:00 (Role)" or blank */
function fmtCell(start: string, end: string, role?: string | null): string {
  const s = start.includes("T") ? start.split("T")[1]!.slice(0, 5) : start;
  const e = end.includes("T") ? end.split("T")[1]!.slice(0, 5) : end;
  return role ? `${s}-${e} (${role})` : `${s}-${e}`;
}

export interface ShiftForExport {
  employeeId: number;
  startTime: string;
  endTime: string;
  role?: string | null;
  status: string;
}

export interface UserForExport {
  id: number;
  name: string;
}

/**
 * Generate CSV string for a monthly roster.
 * Columns: Staff Name | date1 | date2 | ...
 * Rows: one per employee.
 */
export function exportMonthlyRosterCsv(
  users: UserForExport[],
  shifts: ShiftForExport[],
  year: number,
  month: number,
  currency?: string,
  hourlyRates?: Record<number, string>,
): string {
  const dates = getMonthDates(year, month);

  // Build shift map: empId:dateStr -> cell text
  const cellMap = new Map<string, string>();
  for (const s of shifts) {
    if (!s.startTime) continue;
    const dateStr = s.startTime.includes("T")
      ? s.startTime.split("T")[0]!
      : format(new Date(s.startTime), "yyyy-MM-dd");
    const key = `${s.employeeId}:${dateStr}`;
    const existing = cellMap.get(key);
    const cell = fmtCell(s.startTime, s.endTime, s.role);
    cellMap.set(key, existing ? `${existing} / ${cell}` : cell);
  }

  const currencySymbol = currency
    ? { USD: "$", GBP: "£", EUR: "€", AUD: "A$", CAD: "C$", NZD: "NZ$", SGD: "S$", AED: "د.إ" }[currency] ?? currency
    : "";

  // Header row
  const header = ["Staff Name", ...dates.map((d) => format(new Date(d), "d-MMM"))];
  const rows = [header];

  for (const u of users) {
    const row = [u.name, ...dates.map((d) => cellMap.get(`${u.id}:${d}`) ?? "")];
    rows.push(row);
  }

  // Optionally add hourly rate / cost summary
  if (hourlyRates && Object.keys(hourlyRates).length > 0) {
    rows.push([]); // blank separator
    for (const u of users) {
      const rate = parseFloat(hourlyRates[u.id] ?? "0");
      if (!rate) continue;
      let totalHours = 0;
      for (const s of shifts) {
        if (s.employeeId !== u.id) continue;
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        totalHours += (end.getTime() - start.getTime()) / 3_600_000;
      }
      const cost = (rate * totalHours).toFixed(2);
      rows.push([`${u.name} — ${totalHours.toFixed(1)}h @ ${currencySymbol}${rate}/hr`, `Total: ${currencySymbol}${cost}`, ...Array(dates.length - 1).fill("")]);
    }
  }

  return rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
}

function escapeCsv(val: string | undefined): string {
  if (!val) return "";
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Generate a blank template CSV with all staff names and dates pre-filled.
 * Managers fill in shift times manually.
 */
export function generateTemplateCsv(users: UserForExport[], year: number, month: number): string {
  const dates = getMonthDates(year, month);
  const header = ["Staff Name", ...dates.map((d) => format(new Date(d), "d-MMM (EEE)"))];
  const rows = [header, ...users.map((u) => [u.name, ...Array(dates.length).fill("")])];
  return rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
}

/**
 * Parse an imported CSV back into shift-like objects.
 * Expected format: same as template — Staff Name column + date columns.
 * Cell format: "HH:MM-HH:MM" or "HH:MM-HH:MM (Role)" or blank.
 */
export interface ParsedShiftRow {
  employeeName: string;
  dateStr: string;   // "yyyy-MM-dd"
  startTime: string; // ISO
  endTime: string;   // ISO
  role?: string;
}

export function parseRosterCsv(
  csvText: string,
  users: UserForExport[],
  year: number,
  month: number,
): { rows: ParsedShiftRow[]; errors: string[] } {
  const dates = getMonthDates(year, month);
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  const rows: ParsedShiftRow[] = [];

  if (lines.length < 2) {
    errors.push("CSV is empty or has no data rows.");
    return { rows, errors };
  }

  const header = parseCsvLine(lines[0]!);
  // Map column index to date string
  const colToDate = new Map<number, string>();
  for (let col = 1; col < header.length; col++) {
    const colLabel = header[col]!.trim();
    // Try to match by day number within the month
    const dayMatch = colLabel.match(/^(\d{1,2})/);
    if (dayMatch) {
      const day = parseInt(dayMatch[1]!, 10);
      const d = dates[day - 1];
      if (d) colToDate.set(col, d);
    }
  }

  const userByName = new Map(users.map((u) => [u.name.toLowerCase().trim(), u]));

  for (let row = 1; row < lines.length; row++) {
    const cols = parseCsvLine(lines[row]!);
    const employeeName = cols[0]?.trim() ?? "";
    if (!employeeName) continue;

    const user = userByName.get(employeeName.toLowerCase());
    if (!user) {
      errors.push(`Row ${row + 1}: Employee "${employeeName}" not found — skipped.`);
      continue;
    }

    for (const [col, dateStr] of colToDate) {
      const cell = cols[col]?.trim() ?? "";
      if (!cell) continue;

      // Parse "HH:MM-HH:MM" or "HH:MM-HH:MM (Role)"
      const match = cell.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\s*\(([^)]+)\))?/);
      if (!match) {
        errors.push(`Row ${row + 1}, col ${col + 1}: Cannot parse "${cell}" — use HH:MM-HH:MM format.`);
        continue;
      }
      const [, startHM, endHM, role] = match;
      rows.push({
        employeeName: user.name,
        dateStr,
        startTime: `${dateStr}T${startHM}:00`,
        endTime: `${dateStr}T${endHM}:00`,
        role: role?.trim() || undefined,
      });
    }
  }

  return { rows, errors };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
