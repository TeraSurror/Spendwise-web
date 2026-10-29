const PREFIXES = /^(SQ ?\*|TST ?\*|PY ?\*|PP ?\*|PAYPAL ?\*|SP ?\*|DD ?\*|IN ?\*|BT ?\*|CKO ?\*|POS DEBIT|POS PURCHASE|DEBIT CARD PURCHASE|PURCHASE AUTHORIZED ON \d{2}\/\d{2})\s*/i;

const SMALL = new Set(["and", "of", "the", "at", "on", "in", "for", "to"]);

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Turns a raw statement description into a stable merchant name:
 * "SQ *BLUE BOTTLE COFFEE #123  OAKLAND CA" -> "Blue Bottle Coffee".
 */
export function cleanMerchant(raw: string): string {
  // Card exports pad the merchant from its city with runs of spaces: "WHOLE FOODS   SAN FRANCISCO CA".
  let s = raw.trim().replace(/\s{3,}\S.*$/, "").replace(/\s+/g, " ");
  for (let i = 0; i < 2; i++) s = s.replace(PREFIXES, "");
  s = s
    .replace(/\*(?=[A-Z0-9]*\d)[A-Z0-9]{4,}\b.*$/i, "") // "AMZN Mktp US*2K4AB12C3" order ids
    .replace(/\s#\s?\d+.*$/, "") // store numbers and everything after
    .replace(/\s\d{3,}.*$/, "") // phone numbers, terminal ids, trailing dates
    .replace(/[\s*#\-]+$/, "")
    .trim();
  if (!s) s = raw.trim();
  return /[a-z]/.test(s) && /[A-Z]/.test(s) ? s : titleCase(s);
}

export function normalizeDescription(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}
