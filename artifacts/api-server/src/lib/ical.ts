/**
 * Server-side iCalendar (RFC 5545) generator.
 *
 * Single source of truth for VCALENDAR output — the web-app uses a slim
 * client-side copy for browser Blob downloads, but anything served over HTTP
 * must go through this so the wire format stays consistent.
 *
 * Output is RFC 5545 compliant:
 *   - CRLF line endings (\r\n)
 *   - Lines folded at 75 octets with continuation (single leading space)
 *   - DTSTAMP/DTSTART/DTEND in UTC (Z suffix)
 *   - TEXT-unsafe chars escaped in SUMMARY/LOCATION/DESCRIPTION/UID
 */

export interface ICalShift {
  id: number;
  startTime: string; // ISO 8601, will be normalized to UTC
  endTime: string;   // ISO 8601, will be normalized to UTC
  role?: string | null;
  notes?: string | null;
  workplaceName?: string | null;
  workplaceAddress?: string | null;
  companyName?: string;
}

function fmtICalDate(iso: string): string {
  // ISO 8601 -> iCal UTC: 20240101T090000Z
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date for iCal: ${iso}`);
  }
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escIcal(s: string): string {
  // RFC 5545 §3.3.11 — escape backslash, semicolon, comma, and newlines.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold a content line at 75 octets with CRLF + single-space continuation.
 * Operates on JavaScript string length (UTF-16 code units); for the shifts
 * we generate (ASCII summary/location, short descriptions) this is
 * functionally identical to octet counting — if we ever ship multibyte
 * content >75 octets long, swap to a TextEncoder.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    chunks.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join("\r\n");
}

export function generateIcal(shifts: ICalShift[], calendarName = "My Shifts"): string {
  const now = fmtICalDate(new Date().toISOString());
  const prodIdSafe = escIcal(calendarName);

  const events = shifts.map((s) => {
    const dtStart = fmtICalDate(s.startTime);
    const dtEnd = fmtICalDate(s.endTime);
    const summary = s.role ? `${escIcal(s.role)} Shift` : "Work Shift";
    const locationParts = [s.workplaceName, s.workplaceAddress]
      .filter((p): p is string => Boolean(p && p.trim()))
      .map(escIcal);
    const location = locationParts.join(", ");
    const description = s.notes ? escIcal(s.notes) : "";

    // Stable, deterministic UID — calendar apps use this to dedupe events
    // across syncs. If the same shift is updated, the UID stays the same and
    // SEQUENCE would bump; we keep it at 0 (initial) for now since the
    // subscription URL is re-fetched on every sync anyway.
    const uidHost = s.companyName ? escIcal(s.companyName.toLowerCase().replace(/[^a-z0-9]/g, "")) || "syntra" : "syntra";

    const lines: (string | null)[] = [
      "BEGIN:VEVENT",
      `UID:syntra-shift-${s.id}@${uidHost}`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      location ? `LOCATION:${location}` : null,
      description ? `DESCRIPTION:${description}` : null,
      "END:VEVENT",
    ];

    return lines.filter((l): l is string => l !== null).map(foldLine).join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SYNTRA//Workforce Management//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${prodIdSafe}`,
    "X-WR-TIMEZONE:UTC",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}