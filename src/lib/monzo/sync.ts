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
): Promise<{
  imported: number;
  skipped: number;
  declined: number;
  alreadyStored: number;
  categorised: number;
  fetched: number;
  oldest?: string;
  newest?: string;
  accountName?: string;
  fullHistory?: boolean;
}> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: dbAccountId } });

  if (account.providerAccountId.startsWith("pending_") || account.providerAccountId.startsWith("demo_")) {
    throw new Error("Account is not a live Monzo feed");
  }

  try {
    await pingMonzo(dbAccountId);
  } catch (err) {
    if (err instanceof MonzoApiError) {
      throw new Error(`${err.message} — ${err.userHint}`);
    }
    throw err;
  }

  // Confirm this bank account still exists on the token; never rewrite providerAccountId
  // to a different Monzo account (that caused unique constraint collisions).
  const monzoAccounts = await listMonzoAccounts(dbAccountId);
  const matching = monzoAccounts.find((a) => a.id === account.providerAccountId);

  if (!matching) {
    throw new Error(
      `Monzo account ${account.accountName ?? account.providerAccountId} is not visible on this token. Reconnect Monzo once — one login links every Personal/Business feed for that user.`
    );
  }

  if (matching.description && matching.description !== account.accountName) {
    await prisma.account.update({
      where: { id: dbAccountId },
      data: {
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
  let declined = 0;
  let alreadyStored = 0;
  let categorised = 0;

  for (const tx of txs) {
    const result = await upsertMonzoTransaction(tx, userId, dbAccountId);
    if (result === "declined") {
      declined++;
      skipped++;
    } else if (result === "duplicate") {
      alreadyStored++;
      skipped++;
    } else if (result === "skipped") {
      skipped++;
    } else {
      imported++;
      if (result === "categorised") categorised++;
    }
  }

  const times = txs.map((t) => t.created).sort();

  return {
    imported,
    skipped,
    declined,
    alreadyStored,
    categorised,
    fetched: txs.length,
    oldest: times[0],
    newest: times[times.length - 1],
    accountName: matching.description,
    fullHistory: Boolean(options?.fullHistory),
  };
}

export async function upsertMonzoTransaction(
  tx: MonzoTransaction,
  userId: string,
  accountId: string
): Promise<"skipped" | "declined" | "duplicate" | "imported" | "categorised"> {
  if (tx.decline_reason) return "declined";

  const existing = await prisma.transaction.findUnique({
    where: { monzoTransactionId: tx.id },
  });
  if (existing) return "duplicate";

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
      status: "pending", // always needs user review — never auto-confirm
      isIncome: tx.amount > 0 && cat.hmrcCategory === "income",
    },
  });

  return cat.source === "heuristic" ? "imported" : "categorised";
}
