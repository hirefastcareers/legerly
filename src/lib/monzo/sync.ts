import { prisma } from "@/lib/db";
import {
  fetchAllTransactions,
  isPotTransfer,
  listMonzoAccounts,
  MonzoApiError,
  pingMonzo,
  type MonzoTransaction,
} from "@/lib/monzo/client";
import { categoriseTransaction } from "@/lib/tax/rules-engine";

export async function syncAccountTransactions(
  dbAccountId: string,
  userId: string,
  options?: { since?: string; fullHistory?: boolean }
): Promise<{ imported: number; skipped: number; categorised: number; accountName?: string }> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: dbAccountId } });

  // Cheap auth check first so errors are clearer
  try {
    await pingMonzo(dbAccountId);
  } catch (err) {
    if (err instanceof MonzoApiError) {
      throw new Error(`${err.message} — ${err.userHint}`);
    }
    throw err;
  }

  const monzoAccounts = await listMonzoAccounts(dbAccountId);
  const matching =
    monzoAccounts.find((a) => a.id === account.providerAccountId) ??
    monzoAccounts.find((a) => {
      const t = (a.type ?? "").toLowerCase();
      return account.accountType === "business"
        ? t.includes("business")
        : !t.includes("business");
    }) ??
    monzoAccounts[0];

  if (!matching) {
    throw new Error(
      "Monzo returned no open accounts for this token. Reconnect using the Monzo login for that Personal or Business profile."
    );
  }

  // Keep stored account id in sync if Monzo replaced/pending id
  if (matching.id !== account.providerAccountId) {
    await prisma.account.update({
      where: { id: dbAccountId },
      data: {
        providerAccountId: matching.id,
        accountName: matching.description,
        description: matching.description,
      },
    });
  }

  const txs = await fetchAllTransactions(dbAccountId, matching.id, {
    since: options?.since,
    fullHistory: options?.fullHistory,
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

  return {
    imported,
    skipped,
    categorised,
    accountName: matching.description,
  };
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
        useAi: false,
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
