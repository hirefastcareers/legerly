import { prisma } from "@/lib/db";
import {
  fetchAllTransactions,
  isPotTransfer,
  listMonzoAccounts,
  type MonzoTransaction,
} from "@/lib/monzo/client";
import { categoriseTransaction } from "@/lib/tax/rules-engine";

export async function syncAccountTransactions(
  dbAccountId: string,
  userId: string,
  options?: { since?: string }
): Promise<{ imported: number; skipped: number; categorised: number }> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: dbAccountId } });
  const monzoAccounts = await listMonzoAccounts(dbAccountId);
  const matching =
    monzoAccounts.find((a) => a.id === account.providerAccountId) ?? monzoAccounts[0];

  if (!matching) {
    return { imported: 0, skipped: 0, categorised: 0 };
  }

  const txs = await fetchAllTransactions(dbAccountId, matching.id, {
    since: options?.since,
  });

  let imported = 0;
  let skipped = 0;
  let categorised = 0;

  for (const tx of txs) {
    const result = await upsertMonzoTransaction(tx, userId, dbAccountId);
    if (result === "skipped") skipped++;
    else {
      imported++;
      if (result === "categorised") categorised++;
    }
  }

  return { imported, skipped, categorised };
}

export async function upsertMonzoTransaction(
  tx: MonzoTransaction,
  userId: string,
  accountId: string
): Promise<"skipped" | "imported" | "categorised"> {
  if (tx.decline_reason) return "skipped";

  const existing = await prisma.transaction.findUnique({
    where: { monzoTransactionId: tx.id },
  });
  if (existing) return "skipped";

  const pot = isPotTransfer(tx);
  const merchantName = tx.merchant?.name ?? null;
  const cat = pot
    ? {
        hmrcCategory: "non_deductible" as const,
        businessPercent: 0,
        isTaxClaimable: false,
        explanation: "Monzo pot / internal transfer — excluded",
        confidence: 1,
        source: "rule" as const,
        isExcluded: true,
      }
    : await categoriseTransaction({
        description: tx.description,
        merchantName,
        amount: tx.amount,
        monzoCategory: tx.category,
        useAi: false, // keep sync free — AI only via explicit /api/categorise
      });

  await prisma.transaction.create({
    data: {
      userId,
      accountId,
      monzoTransactionId: tx.id,
      amount: tx.amount,
      currency: tx.currency,
      description: tx.description,
      merchantName,
      monzoCategory: tx.category ?? null,
      notes: tx.notes ?? null,
      created: new Date(tx.created),
      settled: tx.settled ? new Date(tx.settled) : null,
      isPotTransfer: pot,
      isExcluded: Boolean(cat.isExcluded || pot),
      source: "monzo",
      hmrcCategory: cat.hmrcCategory,
      businessPercent: cat.businessPercent,
      isTaxClaimable: cat.isTaxClaimable && !pot,
      aiConfidence: cat.confidence,
      aiExplanation: `[${cat.source}] ${cat.explanation}`,
      status: cat.source === "rule" && cat.confidence >= 1 ? "confirmed" : "pending",
      isIncome: tx.amount > 0 && cat.hmrcCategory === "income",
    },
  });

  return cat.source === "heuristic" ? "imported" : "categorised";
}
