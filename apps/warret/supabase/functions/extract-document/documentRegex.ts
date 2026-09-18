/**
 * documentRegex.ts — deterministic field extraction from warranty/invoice text.
 *
 * Pure TypeScript, no runtime APIs — runs inside the extract-document Edge
 * Function (Deno). This pass runs BEFORE any AI call: whatever it finds is
 * kept as-is (deterministic beats generative on conflicts), and only the
 * fields it could NOT find are sent to Claude Haiku.
 *
 * Date disambiguation: DD/MM wins over MM/DD when both are plausible — the
 * app's primary market is India, where DD/MM is the convention. Unambiguous
 * cases (day > 12, or a 4-digit leading year) are decided by the numbers.
 * When a textual date has no day ("expires Jan 2027") we use the 1st of the
 * month — the conservative choice: reminders fire earlier, never later.
 */

export type RegexFields = {
  purchase_date: string | null;
  expiry_date: string | null;
  serial_number: string | null;
  model_number: string | null;
  purchase_price: number | null;
  currency: string | null;
  retailer: string | null;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Validates a real calendar date and returns YYYY-MM-DD, or null. */
function toISO(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Parses one date expression (numeric or textual) into YYYY-MM-DD. */
function parseDateExpression(raw: string): string | null {
  const text = raw.trim();

  // ISO first: 2026-07-10
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return toISO(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Numeric: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY, 2-digit years
  const numeric = /(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/.exec(text);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    // a>12 → a must be the day; b>12 → a must be the month; else DD/MM default.
    if (b > 12 && a <= 12) return toISO(year, a, b);
    return toISO(year, b, a);
  }

  // Textual: "31 March 2026", "March 31, 2026", "Jan 2027" (day optional → 1st)
  const dayFirst = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/.exec(text);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].slice(0, 3).toLowerCase()];
    if (month) return toISO(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }
  const monthFirst = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(text);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].slice(0, 3).toLowerCase()];
    if (month) return toISO(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }
  const monthYear = /([A-Za-z]{3,9})\.?,?\s+(\d{4})/.exec(text);
  if (monthYear) {
    const month = MONTHS[monthYear[1].slice(0, 3).toLowerCase()];
    if (month) return toISO(Number(monthYear[2]), month, 1);
  }
  return null;
}

/** Finds the first date expression within `window` chars after a cue match. */
function dateNearCue(text: string, cue: RegExp, window = 48): string | null {
  const match = cue.exec(text);
  if (!match) return null;
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + window);
  return parseDateExpression(after);
}

/** Adds a warranty period to a purchase date. */
function addPeriod(purchaseISO: string, amount: number, unit: 'year' | 'month'): string | null {
  const [y, m, d] = purchaseISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (unit === 'year') date.setUTCFullYear(date.getUTCFullYear() + amount);
  else date.setUTCMonth(date.getUTCMonth() + amount);
  return toISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

const PURCHASE_CUES = /(?:invoice\s+date|purchase\s+date|date\s+of\s+purchase|billed?\s+on|order\s+date|bill\s+date|purchased\s+on)\s*[:\-]?/i;
const EXPIRY_CUES = /(?:expires?(?:\s+on)?|expiry(?:\s+date)?|valid\s+(?:until|till|upto|up\s+to)|warranty\s+(?:valid\s+)?(?:until|till|up\s*to)|coverage\s+ends?)\s*[:\-]?/i;
const PERIOD_CUE = /(?:warranty(?:\s+period)?\s*[:\-]?\s*(\d{1,2})\s*[- ]?(year|yr|month)s?|(\d{1,2})\s*[- ]?(year|yr|month)s?\s+(?:of\s+)?(?:limited\s+)?warranty)/i;

export function extractWithRegex(input: string): RegexFields {
  // Normalize: strip CR, collapse runs of spaces/tabs (keep newlines — the
  // retailer capture is anchored to end-of-line).
  const text = input.replace(/\r/g, '').replace(/[ \t]+/g, ' ');

  const fields: RegexFields = {
    purchase_date: null,
    expiry_date: null,
    serial_number: null,
    model_number: null,
    purchase_price: null,
    currency: null,
    retailer: null,
  };

  // ── Dates ────────────────────────────────────────────────────────────────
  fields.purchase_date = dateNearCue(text, PURCHASE_CUES);
  fields.expiry_date = dateNearCue(text, EXPIRY_CUES);

  // Relative period ("2 years warranty") → compute expiry from purchase date.
  if (!fields.expiry_date && fields.purchase_date) {
    const period = PERIOD_CUE.exec(text);
    if (period) {
      const amount = Number(period[1] ?? period[3]);
      const unitRaw = (period[2] ?? period[4] ?? '').toLowerCase();
      const unit: 'year' | 'month' = unitRaw.startsWith('month') ? 'month' : 'year';
      if (amount >= 1 && amount <= 30) {
        fields.expiry_date = addPeriod(fields.purchase_date, amount, unit);
      }
    }
  }

  // ── Serial / model numbers ───────────────────────────────────────────────
  const serial = /(?:S\/?N|Serial(?:\s*(?:No|Number))?\.?)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-]{4,24})/i.exec(text);
  if (serial) fields.serial_number = serial[1];

  const model = /(?:Model(?:\s*(?:No|Number))?|Part\s*(?:No|Number)?)\.?\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-/.]{2,29})/i.exec(text);
  if (model) fields.model_number = model[1];

  // ── Price + currency ─────────────────────────────────────────────────────
  const price = /(₹|Rs\.?|INR|\$|USD|€|EUR|£|GBP)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  if (price) {
    const amount = Number(price[2].replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) {
      fields.purchase_price = amount;
      const sym = price[1].toUpperCase().replace('.', '');
      fields.currency =
        sym === '₹' || sym === 'RS' || sym === 'INR' ? 'INR'
        : sym === '$' || sym === 'USD' ? 'USD'
        : sym === '€' || sym === 'EUR' ? 'EUR'
        : 'GBP';
    }
  }

  // ── Retailer ─────────────────────────────────────────────────────────────
  const retailer = /(?:purchased\s+from|sold\s+by|retailer|seller)\s*[:\-]?\s*([^\n]{2,80})/i.exec(text);
  if (retailer) {
    const value = retailer[1].trim().replace(/[.,;|]+$/, '').slice(0, 80);
    if (value) fields.retailer = value;
  }

  return fields;
}
