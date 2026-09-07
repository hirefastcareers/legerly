/**
 * UK Income Tax & Class 4 NI estimator for sole traders (2025-26 rates).
 * Figures are indicative — not formal tax advice.
 */

export type TaxEstimate = {
  turnover: number; // pence
  allowableExpenses: number; // pence
  capitalAllowances: number; // pence
  mileageAllowance: number; // pence
  wfhAllowance: number; // pence
  netProfit: number; // pence
  personalAllowance: number; // pence
  taxableIncome: number; // pence
  incomeTax: number; // pence
  class4NI: number; // pence
  class2NI: number; // pence
  totalLiability: number; // pence
  monthlyTaxPot: number; // pence suggested transfer
  breakdown: {
    basicRateTax: number;
    higherRateTax: number;
    additionalRateTax: number;
  };
};

// 2025-26 / recent UK rates (pence)
const PERSONAL_ALLOWANCE = 1_257_500; // £12,575
const BASIC_RATE_LIMIT = 5_027_000; // £50,270
const HIGHER_RATE_LIMIT = 12_517_000; // £125,140
const BASIC_RATE = 0.2;
const HIGHER_RATE = 0.4;
const ADDITIONAL_RATE = 0.45;

const CLASS4_LOWER = 1_257_000; // £12,570
const CLASS4_UPPER = 5_027_000; // £50,270
const CLASS4_MAIN = 0.06; // 6%
const CLASS4_ADDITIONAL = 0.02; // 2%
const CLASS2_WEEKLY = 360; // £3.60/week (if profits above threshold) — illustrative

const MILEAGE_FIRST_10K = 45; // pence
const MILEAGE_AFTER = 25; // pence
const MILEAGE_THRESHOLD = 10_000;

/** HMRC simplified WFH monthly flat rates by hours worked at home */
export function wfhFlatRatePence(hoursPerMonth: number): number {
  if (hoursPerMonth >= 101) return 2600; // £26
  if (hoursPerMonth >= 51) return 1800; // £18
  if (hoursPerMonth >= 25) return 1000; // £10
  return 0;
}

export function mileageAllowancePence(miles: number, milesAlreadyClaimed = 0): number {
  const remainingFirst = Math.max(0, MILEAGE_THRESHOLD - milesAlreadyClaimed);
  const at45 = Math.min(miles, remainingFirst);
  const at25 = Math.max(0, miles - at45);
  return Math.round(at45 * MILEAGE_FIRST_10K + at25 * MILEAGE_AFTER);
}

export function estimateTaxLiability(input: {
  turnover: number;
  allowableExpenses: number;
  capitalAllowances?: number;
  mileageAllowance?: number;
  wfhAllowance?: number;
}): TaxEstimate {
  const capitalAllowances = input.capitalAllowances ?? 0;
  const mileageAllowance = input.mileageAllowance ?? 0;
  const wfhAllowance = input.wfhAllowance ?? 0;

  const netProfit =
    input.turnover -
    input.allowableExpenses -
    capitalAllowances -
    mileageAllowance -
    wfhAllowance;

  const profit = Math.max(0, netProfit);

  // Taper personal allowance above £100k
  let personalAllowance = PERSONAL_ALLOWANCE;
  if (profit > 10_000_000) {
    const reduction = Math.floor((profit - 10_000_000) / 2);
    personalAllowance = Math.max(0, PERSONAL_ALLOWANCE - reduction);
  }

  const taxableIncome = Math.max(0, profit - personalAllowance);

  let remaining = taxableIncome;
  const basicBand = BASIC_RATE_LIMIT - PERSONAL_ALLOWANCE; // ~£37,700
  const basicSlice = Math.min(remaining, basicBand);
  remaining -= basicSlice;
  const higherBand = HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT;
  const higherSlice = Math.min(remaining, higherBand);
  remaining -= higherSlice;
  const additionalSlice = remaining;

  const basicRateTax = Math.round(basicSlice * BASIC_RATE);
  const higherRateTax = Math.round(higherSlice * HIGHER_RATE);
  const additionalRateTax = Math.round(additionalSlice * ADDITIONAL_RATE);
  const incomeTax = basicRateTax + higherRateTax + additionalRateTax;

  // Class 4 NI
  let class4NI = 0;
  if (profit > CLASS4_LOWER) {
    const mainBand = Math.min(profit, CLASS4_UPPER) - CLASS4_LOWER;
    class4NI += Math.round(mainBand * CLASS4_MAIN);
    if (profit > CLASS4_UPPER) {
      class4NI += Math.round((profit - CLASS4_UPPER) * CLASS4_ADDITIONAL);
    }
  }

  const class2NI = profit >= CLASS4_LOWER ? CLASS2_WEEKLY * 52 : 0;
  const totalLiability = incomeTax + class4NI + class2NI;
  const monthlyTaxPot = Math.round(totalLiability / 12);

  return {
    turnover: input.turnover,
    allowableExpenses: input.allowableExpenses,
    capitalAllowances,
    mileageAllowance,
    wfhAllowance,
    netProfit,
    personalAllowance,
    taxableIncome,
    incomeTax,
    class4NI,
    class2NI,
    totalLiability,
    monthlyTaxPot,
    breakdown: { basicRateTax, higherRateTax, additionalRateTax },
  };
}
