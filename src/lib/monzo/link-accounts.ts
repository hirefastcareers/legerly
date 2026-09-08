import { prisma } from "@/lib/db";
import {
  inferAccountType,
  listMonzoAccounts,
  type MonzoAccount,
} from "@/lib/monzo/client";
import { syncAccountTransactions } from "@/lib/monzo/sync";

type TokenBundle = {
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date;
  monzoUserId: string;
};

/**
 * Monzo allows only ONE active access token per user.
 * Persist that token onto every Monzo account bank feed we discover,
 * then optionally pull full history while SCA is fresh.
 */
export async function linkAllMonzoAccounts(
  userId: string,
  tokens: TokenBundle,
  options?: { fullHistory?: boolean; preferredType?: "personal" | "business" }
): Promise<{ accounts: Array<{ id: string; accountType: string; accountName: string | null }>; synced: number }> {
  // Temporary row so we can call Monzo /accounts
  const temp = await prisma.account.create({
    data: {
      userId,
      provider: "monzo",
      providerAccountId: `pending_${tokens.monzoUserId}_${Date.now()}`,
      accountType: options?.preferredType ?? "personal",
      accountName: "Linking…",
      encryptedAccessToken: tokens.encryptedAccessToken,
      encryptedRefreshToken: tokens.encryptedRefreshToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
      monzoUserId: tokens.monzoUserId,
    },
  });

  let monzoAccounts: MonzoAccount[] = [];
  try {
    monzoAccounts = await listMonzoAccounts(temp.id);
  } catch (err) {
    await prisma.account.delete({ where: { id: temp.id } }).catch(() => undefined);
    throw err;
  }

  if (monzoAccounts.length === 0) {
    await prisma.account.delete({ where: { id: temp.id } }).catch(() => undefined);
    throw new Error("NO_ACCOUNTS");
  }

  // Propagate the new token to every existing row for this Monzo user
  // (avoids stale tokens after reconnect / eviction)
  await prisma.account.updateMany({
    where: { userId, monzoUserId: tokens.monzoUserId },
    data: {
      encryptedAccessToken: tokens.encryptedAccessToken,
      encryptedRefreshToken: tokens.encryptedRefreshToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
    },
  });

  const linked = [];
  for (const monzo of monzoAccounts) {
    const accountType = inferAccountType(monzo);
    const saved = await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: "monzo",
          providerAccountId: monzo.id,
        },
      },
      update: {
        userId,
        accountType,
        accountName: monzo.description,
        description: monzo.description,
        currency: monzo.currency ?? "GBP",
        encryptedAccessToken: tokens.encryptedAccessToken,
        encryptedRefreshToken: tokens.encryptedRefreshToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        monzoUserId: tokens.monzoUserId,
      },
      create: {
        userId,
        provider: "monzo",
        providerAccountId: monzo.id,
        accountType,
        accountName: monzo.description,
        description: monzo.description,
        currency: monzo.currency ?? "GBP",
        encryptedAccessToken: tokens.encryptedAccessToken,
        encryptedRefreshToken: tokens.encryptedRefreshToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        monzoUserId: tokens.monzoUserId,
      },
    });
    linked.push(saved);
  }

  // Remove temporary + any other pending placeholders for this user
  await prisma.account.deleteMany({
    where: {
      userId,
      providerAccountId: { startsWith: "pending_" },
    },
  });

  // Clear demo junk
  const demoAccounts = await prisma.account.findMany({
    where: {
      userId,
      OR: [{ encryptedAccessToken: "demo" }, { providerAccountId: { startsWith: "demo_" } }],
    },
    select: { id: true },
  });
  if (demoAccounts.length) {
    await prisma.transaction.deleteMany({
      where: { userId, accountId: { in: demoAccounts.map((a) => a.id) } },
    });
    await prisma.account.deleteMany({ where: { id: { in: demoAccounts.map((a) => a.id) } } });
  }
  await prisma.transaction.deleteMany({
    where: { userId, monzoTransactionId: { startsWith: "demo_" } },
  });

  let synced = 0;
  if (options?.fullHistory !== false) {
    for (const account of linked) {
      try {
        await syncAccountTransactions(account.id, userId, { fullHistory: true });
        synced++;
      } catch (err) {
        console.error(`Full history sync failed for ${account.id}`, err);
        // Fall back to 90-day sync so user still gets something
        try {
          await syncAccountTransactions(account.id, userId, { fullHistory: false });
          synced++;
        } catch (err2) {
          console.error(`90-day sync also failed for ${account.id}`, err2);
        }
      }
    }
  }

  return {
    accounts: linked.map((a) => ({
      id: a.id,
      accountType: a.accountType,
      accountName: a.accountName,
    })),
    synced,
  };
}

/** Keep every DB row for a Monzo user on the same access/refresh tokens. */
export async function propagateTokensForMonzoUser(
  monzoUserId: string,
  tokens: {
    encryptedAccessToken: string;
    encryptedRefreshToken?: string | null;
    tokenExpiresAt: Date;
  }
) {
  await prisma.account.updateMany({
    where: { monzoUserId, encryptedAccessToken: { not: "demo" } },
    data: {
      encryptedAccessToken: tokens.encryptedAccessToken,
      ...(tokens.encryptedRefreshToken !== undefined
        ? { encryptedRefreshToken: tokens.encryptedRefreshToken }
        : {}),
      tokenExpiresAt: tokens.tokenExpiresAt,
    },
  });
}
