import { prisma } from "@/lib/db";
import { categoriseTransaction } from "@/lib/tax/rules-engine";
import { fingerprintRow } from "@/lib/statements/parse-csv";
import { getTaxYear } from "@/lib/tax/tax-year";
import type { ParsedStatementRow, StatementParseResult } from "@/lib/statements/types";

async function ensureUploadAccount(
  userId: string,
  accountType: "personal" | "business"
) {
  const providerAccountId = `upload_${accountType}`;
  return prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: "statement",
        providerAccountId,
      },
    },
    update: {
      userId,
      accountName: `Statement import (${accountType})`,
      description: "Uploaded bank statements",
    },
    create: {
      userId,
      provider: "statement",
      providerAccountId,
      accountType,
      accountName: `Statement import (${accountType})`,
      description: "Uploaded bank statements",
      currency: "GBP",
      encryptedAccessToken: "statement",
    },
  });
}

export type ImportFileResult = {
  fileName: string;
  accountType: "personal" | "business";
  imported: number;
  duplicates: number;
  sourceRows: number;
  skippedRows: number;
  format: StatementParseResult["format"];
  warnings: string[];
  oldest?: string;
  newest?: string;
  byTaxYear: Record<string, number>;
  error?: string;
};

export async function importParsedStatement(
  userId: string,
  parsed: StatementParseResult,
  options?: {
    accountType?: "personal" | "business";
    useAiCategorise?: boolean;
    fileName?: string;
  }
): Promise<ImportFileResult> {
  const accountType = options?.accountType ?? "personal";
  const account = await ensureUploadAccount(userId, accountType);

  let imported = 0;
  let duplicates = 0;
  const dates: Date[] = [];
  const byTaxYear: Record<string, number> = {};

  for (const row of parsed.rows) {
    const result = await upsertStatementRow(
      userId,
      account.id,
      row,
      accountType,
      options?.useAiCategorise
    );
    if (result === "duplicate") {
      duplicates++;
    } else {
      imported++;
      dates.push(row.date);
      const label = getTaxYear(row.date).label;
      byTaxYear[label] = (byTaxYear[label] ?? 0) + 1;
    }
  }

  dates.sort((a, b) => a.getTime() - b.getTime());

  return {
    fileName: options?.fileName ?? "statement",
    accountType,
    imported,
    duplicates,
    sourceRows: parsed.sourceRows,
    skippedRows: parsed.skippedRows,
    format: parsed.format,
    warnings: parsed.warnings,
    oldest: dates[0]?.toISOString(),
    newest: dates[dates.length - 1]?.toISOString(),
    byTaxYear,
  };
}

async function upsertStatementRow(
  userId: string,
  accountId: string,
  row: ParsedStatementRow,
  accountType: "personal" | "business",
  useAi?: boolean
): Promise<"imported" | "duplicate"> {
  const fingerprint = fingerprintRow(row, accountType);

  // Prefer Monzo tx id collision if CSV includes it and Monzo already synced the same payment
  if (row.externalId?.startsWith("tx_")) {
    const byMonzo = await prisma.transaction.findUnique({
      where: { monzoTransactionId: row.externalId },
    });
    if (byMonzo) return "duplicate";
  }

  const existing = await prisma.transaction.findUnique({
    where: { monzoTransactionId: fingerprint },
  });
  if (existing) return "duplicate";

  const cat = await categoriseTransaction({
    description: row.description,
    merchantName: row.merchantName,
    amount: row.amountPence,
    useAi: Boolean(useAi),
  });

  await prisma.transaction.create({
    data: {
      userId,
      accountId,
      monzoTransactionId: fingerprint,
      amount: row.amountPence,
      currency: row.currency ?? "GBP",
      description: row.description,
      merchantName: row.merchantName ?? null,
      notes: row.notes ?? null,
      created: row.date,
      settled: row.date,
      isPotTransfer: Boolean(cat.isExcluded),
      isExcluded: Boolean(cat.isExcluded),
      source: "upload",
      hmrcCategory: cat.hmrcCategory,
      businessPercent: cat.businessPercent,
      isTaxClaimable: cat.isTaxClaimable && !cat.isExcluded,
      aiConfidence: cat.confidence,
      aiExplanation: `[${cat.source}] ${cat.explanation}`,
      status: "pending",
      isIncome: row.amountPence > 0 && cat.hmrcCategory === "income",
    },
  });

  return "imported";
}

/** Combined Personal + Business coverage for the review workspace. */
export async function getCombinedCoverage(userId: string) {
  const txs = await prisma.transaction.findMany({
    where: { userId },
    select: {
      created: true,
      status: true,
      source: true,
      account: { select: { accountType: true } },
    },
    orderBy: { created: "asc" },
  });

  const byFeed = {
    personal: { total: 0, pending: 0, oldest: null as string | null, newest: null as string | null },
    business: { total: 0, pending: 0, oldest: null as string | null, newest: null as string | null },
    unknown: { total: 0, pending: 0, oldest: null as string | null, newest: null as string | null },
  };
  const byTaxYear: Record<
    string,
    { total: number; pending: number; personal: number; business: number }
  > = {};

  for (const tx of txs) {
    const feed =
      tx.account?.accountType === "business"
        ? "business"
        : tx.account?.accountType === "personal"
          ? "personal"
          : "unknown";
    const bucket = byFeed[feed];
    bucket.total++;
    if (tx.status === "pending") bucket.pending++;
    const iso = tx.created.toISOString();
    if (!bucket.oldest) bucket.oldest = iso;
    bucket.newest = iso;

    const year = getTaxYear(tx.created).label;
    if (!byTaxYear[year]) {
      byTaxYear[year] = { total: 0, pending: 0, personal: 0, business: 0 };
    }
    byTaxYear[year].total++;
    if (tx.status === "pending") byTaxYear[year].pending++;
    if (feed === "personal") byTaxYear[year].personal++;
    if (feed === "business") byTaxYear[year].business++;
  }

  return {
    total: txs.length,
    pending: txs.filter((t) => t.status === "pending").length,
    byFeed,
    byTaxYear,
    oldest: txs[0]?.created.toISOString() ?? null,
    newest: txs[txs.length - 1]?.created.toISOString() ?? null,
  };
}
