/**
 * "Add to Calendar" deep-link helper.
 *
 * The goal: clicking "Add to Calendar" should launch the user's native
 * calendar app, NOT download a .ics file to disk. The mechanism:
 *
 *  1. Mint (or fetch) a long-lived webcal token via POST /api/calendar/token.
 *     The token authenticates the subscription URL — calendar apps can't
 *     carry a Bearer header, so the credential lives in the URL itself.
 *     Tokens are cached in localStorage so we don't re-mint on every click.
 *
 *  2. Build a `webcal://<host>/api/calendar/shifts.ics?token=...` URL.
 *     - iOS / macOS: `webcal://` is a registered URL scheme → hands off to
 *       Apple Calendar / Google Calendar / Outlook depending on defaults.
 *     - Android: most calendar apps register `webcal://` too.
 *     - Windows / Linux desktop: `webcal://` is unreliable, so we fall back
 *       to the `https://` form of the same URL — modern browsers render the
 *       `text/calendar` MIME inline and let the user pick their handler.
 *
 *  3. Last-resort fallback: Google Calendar's import-by-URL flow, which
 *     accepts any public .ics URL. This catches the case where the user is
 *     on a system with NO registered calendar handler at all.
 *
 *  4. Final fallback: downloadIcal — same behavior as before, so we never
 *     leave the user without an option.
 */

import { downloadIcal, generateIcal } from "./ical";

const TOKEN_CACHE_KEY = "syntra.webcalToken";

function getCachedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_CACHE_KEY);
  } catch {
    return null;
  }
}

function cacheToken(t: string): void {
  try {
    localStorage.setItem(TOKEN_CACHE_KEY, t);
  } catch {
    // localStorage blocked — not fatal; we'll just re-mint next click.
  }
}

async function mintWebcalToken(): Promise<string> {
  const token = localStorage.getItem("auth_token");
  if (!token) throw new Error("Not signed in");

  const res = await fetch("/api/calendar/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error("Failed to mint calendar token"), { data: body, status: res.status });
  }
  const { token: webcalToken } = (await res.json()) as { token: string };
  if (!webcalToken) throw new Error("Server returned no token");
  return webcalToken;
}

async function getWebcalToken(): Promise<string> {
  const cached = getCachedToken();
  if (cached) return cached;
  const fresh = await mintWebcalToken();
  cacheToken(fresh);
  return fresh;
}

function buildCalendarUrls(token: string): { webcal: string; https: string } {
  // window.location.origin gives us "https://syntra.terrybot.top" — swap the
  // scheme to webcal:// for native handoff on iOS/macOS/Android.
  const origin = window.location.origin;
  const httpsUrl = `${origin}/api/calendar/shifts.ics?token=${encodeURIComponent(token)}`;
  const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");
  return { webcal: webcalUrl, https: httpsUrl };
}

function detectPlatform(): "ios" | "macos" | "android" | "windows" | "linux" | "unknown" {
  const ua = navigator.userAgent;
  // Order matters — iPad/iPhone before Mac because iPadOS reports as Mac.
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(ua)) return "linux";
  return "unknown";
}

/**
 * Attempt to launch the native calendar app via `webcal://`.
 *
 * Returns true if the browser/code path took the attempt. There's NO
 * reliable way to detect success — once `window.location.assign(webcal://)`
 * fires, control leaves the page. If the OS has no handler, the user will
 * see "scheme not registered" or the page will silently no-op. That's
 * fine: we always show a fallback in the UI.
 */
function tryWebcalDeepLink(webcalUrl: string): boolean {
  try {
    // Use location.assign rather than setting location.href — assign is
    // marginally more permissive with custom schemes on some browsers.
    window.location.assign(webcalUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the .ics URL in the current tab via `https://`. The server sends
 * `Content-Disposition: inline` + `Content-Type: text/calendar`, so browsers
 * with registered handlers (default Calendar app on macOS, calendar
 * extensions on Win/Linux) will hand off to them. On browsers without a
 * handler, the .ics renders as plain text — not pretty but not broken.
 */
function openHttpsUrl(httpsUrl: string): void {
  window.open(httpsUrl, "_blank", "noopener,noreferrer");
}

/**
 * Google Calendar's import-by-URL endpoint. Last-resort fallback for users
 * with no local calendar handler (common on Linux + headless browsers).
 * Google fetches our .ics URL server-side, parses it, and offers "Add".
 */
function openGoogleCalendarImport(httpsUrl: string): void {
  const gcal = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(httpsUrl)}`;
  window.open(gcal, "_blank", "noopener,noreferrer");
}

/**
 * Main entry point used by the "Add to Calendar" button.
 *
 * Behavior matrix:
 *  ┌────────────┬──────────────────────────────────────────────┐
 *  │ Platform   │ Strategy                                     │
 *  ├────────────┼──────────────────────────────────────────────┤
 *  │ iOS / macOS│ webcal:// deep link                         │
 *  │ Android    │ webcal:// deep link                         │
 *  │ Win / Linux│ open https:// (browser → calendar handler)  │
 *  │ Other      │ open https://                                │
 *  └────────────┴──────────────────────────────────────────────┘
 *
 * If the platform has NO registered handler (Windows / Linux without
 * calendar software), the user sees the .ics rendered as text in the new
 * tab — that's the universal fallback. From there they can copy the URL
 * into Google Calendar import or save it manually.
 *
 * We also cache the token so subsequent clicks skip the mint call.
 */
export async function openNativeCalendar(): Promise<void> {
  const token = await getWebcalToken();
  const { webcal, https } = buildCalendarUrls(token);

  // Strategy 1: native deep-link. On iOS/macOS/Android this hands off
  // immediately to the registered calendar app.
  if (tryWebcalDeepLink(webcal)) {
    // Wait a beat — if the OS didn't hand off (no handler), the page
    // stays put and we want to nudge the user to the https fallback.
    // We don't know definitively whether handoff succeeded, so we just
    // let the existing toast guide them.
    return;
  }

  // Strategy 2: https URL — browser shows inline .ics, user can save /
  // hand off via their OS handler.
  const platform = detectPlatform();
  if (platform === "windows" || platform === "linux") {
    openHttpsUrl(https);
    return;
  }

  // Strategy 3: Google Calendar import — guaranteed path for any user
  // with a Google account, even if their OS has no calendar handler.
  openGoogleCalendarImport(https);
}

/**
 * Wipe the cached token — used when the user signs out or explicitly
 * revokes access. After this, the next click will mint a fresh token.
 */
export function clearCachedWebcalToken(): void {
  try {
    localStorage.removeItem(TOKEN_CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Legacy entry point kept for callers that already have a generated .ics
 * string in hand (e.g. the monthly CSV export path). Falls back to a plain
 * download — same behavior as the original `handleIcalExport`.
 */
export function downloadIcalFallback(content: string, filename = "syntra-shifts.ics"): void {
  downloadIcal(content, filename);
}

export { generateIcal };