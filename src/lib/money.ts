/**
 * Parses a bank-export amount into integer cents.
 * Handles "$1,234.56", "-12.34", "(12.34)" (negative), "12.34-" and blanks (null).
 */
export function parseCents(input: string | undefined | null): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s || s === "--") return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1); }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2)) + (Number(frac[2] ?? 0) >= 5 ? 1 : 0);
  return negative ? -cents : cents;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatCents(cents: number, opts: { whole?: boolean } = {}): string {
  return (opts.whole ? usdWhole : usd).format(cents / 100);
}
