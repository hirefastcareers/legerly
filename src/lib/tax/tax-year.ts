/**
 * UK tax year helpers: 6 April – 5 April.
 */

export type TaxYear = {
  label: string; // e.g. "2025-26"
  start: Date; // 6 April YYYY
  end: Date; // 5 April YYYY+1 (inclusive end of day)
  startYear: number;
};

export function getTaxYear(date: Date = new Date()): TaxYear {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();
  // Before 6 April → previous tax year
  const startYear = month < 3 || (month === 3 && day < 6) ? year - 1 : year;
  return buildTaxYear(startYear);
}

export function buildTaxYear(startYear: number): TaxYear {
  const start = new Date(Date.UTC(startYear, 3, 6, 0, 0, 0));
  const end = new Date(Date.UTC(startYear + 1, 3, 5, 23, 59, 59, 999));
  return {
    label: `${startYear}-${String(startYear + 1).slice(2)}`,
    start,
    end,
    startYear,
  };
}

export function listTaxYears(count = 5): TaxYear[] {
  const current = getTaxYear();
  return Array.from({ length: count }, (_, i) => buildTaxYear(current.startYear - i));
}

export function parseTaxYearLabel(label: string): TaxYear {
  const startYear = parseInt(label.split("-")[0], 10);
  if (Number.isNaN(startYear)) throw new Error(`Invalid tax year: ${label}`);
  return buildTaxYear(startYear);
}

export function isInTaxYear(date: Date, taxYear: TaxYear): boolean {
  const t = date.getTime();
  return t >= taxYear.start.getTime() && t <= taxYear.end.getTime();
}
