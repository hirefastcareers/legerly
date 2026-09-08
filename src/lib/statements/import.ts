import { prisma } from "@/lib/db";
import { categoriseTransaction } from "@/lib/tax/rules-engine";
import { fingerprintRow } from "@/lib/statements/parse-csv";
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

export async function importParsedStatement(
  userId: string,
  parsed: StatementParseResult,
  options?: { accountType?: "personal" | "business"; useAiCategorise?: boolean }
): Promise<{
  imported: number;
  duplicates: number;
  format: StatementParseResult["format"];
  warnings: string[];
  oldest?: string;
  newest?: string;
}> {
  const accountType = options?.accountType ?? "personal";
  const account = await ensureUploadAccount(userId, accountType);

  let imported = 0;
  let duplicates = 0;
  const dates: Date[] = [];

  for (const row of parsed.rows) {
    const result = await upsertStatementRow(userId, account.id, row, options?.useAiCategorise);
    if (result === "duplicate") duplicates++;
    else {
      imported++;
      dates.push(row.date);
    }
  }

  dates.sort((a, b) => a.getTime() - b.getTime());

  return {
    imported,
    duplicates,
    format: parsed.format,
    warnings: parsed.warnings,
    oldest: dates[0]?.toISOString(),
    newest: dates[dates.length - 1]?.toISOString(),
  };
}

async function upsertStatementRow(
  userId: string,
  accountId: string,
  row: ParsedStatementRow,
  useAi?: boolean
): Promise<"imported" | "duplicate"> {
  const fingerprint = fingerprintRow(row);

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
