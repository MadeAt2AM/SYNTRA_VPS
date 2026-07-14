/**
 * Generate an iCalendar (.ics) file from a list of shifts.
 * Compatible with Apple Calendar, Google Calendar, Outlook.
 */

interface ICalShift {
  id: number;
  startTime: string;
  endTime: string;
  role?: string | null;
  notes?: string | null;
  workplaceName?: string | null;
  workplaceAddress?: string | null;
  companyName?: string;
}

function fmtICalDate(iso: string): string {
  // Convert ISO 8601 to iCal UTC format: 20240101T090000Z
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escIcal(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  // iCal lines must be <= 75 octets; fold longer ones
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  chunks.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    chunks.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join("\r\n");
}

export function generateIcal(shifts: ICalShift[], calendarName = "My Shifts"): string {
  const now = fmtICalDate(new Date().toISOString());

  const events = shifts.map((s) => {
    const dtStart = fmtICalDate(s.startTime);
    const dtEnd = fmtICalDate(s.endTime);
    const summary = s.role ? `${escIcal(s.role)} Shift` : "Work Shift";
    const location = [s.workplaceName, s.workplaceAddress].filter(Boolean).map(escIcal).join(", ");
    const description = s.notes ? escIcal(s.notes) : "";

    const lines = [
      "BEGIN:VEVENT",
      `UID:syntra-shift-${s.id}@syntra`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      location ? `LOCATION:${location}` : null,
      description ? `DESCRIPTION:${description}` : null,
      "END:VEVENT",
    ].filter(Boolean) as string[];

    return lines.map(foldLine).join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SYNTRA//Workforce Management//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escIcal(calendarName)}`,
    "X-WR-TIMEZONE:UTC",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcal(content: string, filename = "shifts.ics"): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
