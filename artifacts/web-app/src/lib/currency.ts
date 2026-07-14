/**
 * Shared currency formatting so every screen that shows money respects the
 * company's configured currency (Settings → Currency) instead of a hardcoded "$".
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", GBP: "£", EUR: "€", AUD: "A$", CAD: "C$", NZD: "NZ$", SGD: "S$", AED: "د.إ",
};

/** Best-effort symbol for a currency code, falling back to the code itself. */
export function getCurrencySymbol(code?: string | null): string {
  if (!code) return "$";
  return CURRENCY_SYMBOLS[code] ?? code;
}

/** Format a number as money using the company's currency code (defaults to USD). */
export function formatMoney(value: number, currencyCode?: string | null, opts?: Intl.NumberFormatOptions): string {
  const code = currencyCode || "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      ...opts,
    }).format(value);
  } catch {
    return `${getCurrencySymbol(code)}${value.toLocaleString()}`;
  }
}

/** Format an hourly rate like "$18.50/hr" using the company's currency symbol. */
export function formatHourlyRate(rate: string | number | null | undefined, currencyCode?: string | null): string {
  if (rate === null || rate === undefined || rate === "") return "Salary";
  return `${getCurrencySymbol(currencyCode)}${rate}/hr`;
}
