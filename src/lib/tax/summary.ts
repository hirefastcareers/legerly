import { prisma } from "@/lib/db";
import {
  estimateTaxLiability,
  mileageAllowancePence,
  type TaxEstimate,
} from "@/lib/tax/calculator";
import { HMRC_CATEGORIES, type HmrcCategoryKey } from "@/lib/tax/hmrc-categories";
import { parseTaxYearLabel, type TaxYear } from "@/lib/tax/tax-year";

export type BoxSummary = {
  key: HmrcCategoryKey;
  label: string;
  sa103Box: string;
  totalPence: number;
  count: number;
};

export type TaxSummary = {
  taxYear: TaxYear;
  boxes: BoxSummary[];
  estimate: TaxEstimate;
  pendingReview: number;
  claimableCount: number;
};

function claimableAmount(amount: number, businessPercent: number): number {
  // expenses are negative in Monzo; convert to positive expense total
  const abs = Math.abs(amount);
  return Math.round((abs * businessPercent) / 100);
}

export async function buildTaxSummary(
  userId: string,
  taxYearLabel: string
): Promise<TaxSummary> {
  const taxYear = parseTaxYearLabel(taxYearLabel);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      isExcluded: false,
      isPotTransfer: false,
      created: { gte: taxYear.start, lte: taxYear.end },
    },
  });

  const boxTotals = new Map<string, { total: number; count: number }>();
  for (const key of Object.keys(HMRC_CATEGORIES)) {
    boxTotals.set(key, { total: 0, count: 0 });
  }

  let turnover = 0;
  let allowableExpenses = 0;
  let capitalAllowances = 0;
  let pendingReview = 0;
  let claimableCount = 0;

  for (const tx of transactions) {
    if (tx.status === "pending") pendingReview++;

    const cat = (tx.hmrcCategory ?? "non_deductible") as HmrcCategoryKey;
    const bucket = boxTotals.get(cat) ?? { total: 0, count: 0 };

    if (tx.isIncome || cat === "income" || tx.amount > 0) {
      if (tx.isIncome || cat === "income") {
        turnover += tx.amount;
        bucket.total += tx.amount;
        bucket.count++;
      }
      boxTotals.set(cat === "income" ? "income" : cat, bucket);
      continue;
    }

    // Outflow
    if (tx.isTaxClaimable && cat !== "non_deductible") {
      const claim = claimableAmount(tx.amount, tx.businessPercent);
      bucket.total += claim;
      bucket.count++;
      claimableCount++;
      if (cat === "capital_allowances") capitalAllowances += claim;
      else allowableExpenses += claim;
    } else {
      bucket.count++;
    }
    boxTotals.set(cat, bucket);
  }

  const [mileageLogs, wfhLogs] = await Promise.all([
    prisma.mileageLog.findMany({ where: { userId, taxYear: taxYearLabel } }),
    prisma.wfhLog.findMany({ where: { userId, taxYear: taxYearLabel } }),
  ]);

  let milesSoFar = 0;
  let mileageAllowance = 0;
  for (const log of mileageLogs) {
    mileageAllowance += mileageAllowancePence(log.miles, milesSoFar);
    milesSoFar += log.miles;
  }

  const wfhAllowance = wfhLogs.reduce((sum, l) => sum + l.flatRatePence, 0);

  const estimate = estimateTaxLiability({
    turnover,
    allowableExpenses,
    capitalAllowances,
    mileageAllowance,
    wfhAllowance,
  });

  const boxes: BoxSummary[] = Object.values(HMRC_CATEGORIES).map((c) => {
    const b = boxTotals.get(c.key) ?? { total: 0, count: 0 };
    return {
      key: c.key,
      label: c.label,
      sa103Box: c.sa103Box,
      totalPence: b.total,
      count: b.count,
    };
  });

  return { taxYear, boxes, estimate, pendingReview, claimableCount };
}
