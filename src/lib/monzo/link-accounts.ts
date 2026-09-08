import { prisma } from "@/lib/db";
import {
  inferAccountType,
  listMonzoAccounts,
  MonzoApiError,
  pingMonzo,
  type MonzoAccount,
} from "@/lib/monzo/client";
import { syncAccountTransactions } from "@/lib/monzo/sync";

type TokenBundle = {
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date;
  monzoUserId: string;
};

function awaitingId(monzoUserId: string) {
  return `awaiting_${monzoUserId}`;
}

/**
 * Save OAuth tokens without calling Monzo APIs yet.
 * Permissions only exist after the user approves in the Monzo app (after redirect).
 */
export async function storeAwaitingApproval(
  userId: string,
  tokens: TokenBundle,
  preferredType: "personal" | "business" = "personal"
) {
  // Drop other awaiting placeholders for this app user
  await prisma.account.deleteMany({
    where: {
      userId,
      OR: [
        { providerAccountId: { startsWith: "awaiting_" } },
        { providerAccountId: { startsWith: "pending_" } },
      ],
    },
  });

  // Propagate token onto any already-linked live feeds for this Monzo user
  await prisma.account.updateMany({
    where: { userId, monzoUserId: tokens.monzoUserId },
    data: {
      encryptedAccessToken: tokens.encryptedAccessToken,
      encryptedRefreshToken: tokens.encryptedRefreshToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
    },
  });

  const row = await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: "monzo",
        providerAccountId: awaitingId(tokens.monzoUserId),
      },
    },
    update: {
      userId,
      accountType: preferredType,
      accountName: "Waiting for Monzo app approval",
      description: "Approve the push notification in the Monzo app, then click Import",
      encryptedAccessToken: tokens.encryptedAccessToken,
      encryptedRefreshToken: tokens.encryptedRefreshToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
      monzoUserId: tokens.monzoUserId,
    },
    create: {
      userId,
      provider: "monzo",
      providerAccountId: awaitingId(tokens.monzoUserId),
      accountType: preferredType,
      accountName: "Waiting for Monzo app approval",
      description: "Approve the push notification in the Monzo app, then click Import",
      encryptedAccessToken: tokens.encryptedAccessToken,
      encryptedRefreshToken: tokens.encryptedRefreshToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
      monzoUserId: tokens.monzoUserId,
    },
  });

  return row;
}

export async function getAwaitingConnection(userId: string) {
  return prisma.account.findFirst({
    where: {
      userId,
      providerAccountId: { startsWith: "awaiting_" },
      encryptedAccessToken: { not: "demo" },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** Returns whether Monzo has granted API permissions after in-app approval. */
export async function checkMonzoApproval(accountId: string): Promise<{
  ready: boolean;
  message: string;
}> {
  try {
    const who = await pingMonzo(accountId);
    if (!who.authenticated) {
      return { ready: false, message: "Monzo says the token is not authenticated yet." };
    }
    // Listing accounts is the real permission check
    const accounts = await listMonzoAccounts(accountId);
    if (!accounts.length) {
      return {
        ready: false,
        message: "Approved, but no open accounts were returned yet. Try again in a moment.",
      };
    }
    return {
      ready: true,
      message: `Ready — found ${accounts.length} Monzo account${accounts.length === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    if (err instanceof MonzoApiError) {
      return {
        ready: false,
        message: `${err.message}. ${err.userHint}`,
      };
    }
    return {
      ready: false,
      message: err instanceof Error ? err.message : "Not approved yet",
    };
  }
}

/**
 * After in-app approval: discover feeds and import full history (SCA-fresh window).
 */
export async function importAfterApproval(
  userId: string,
  options?: { fullHistory?: boolean }
): Promise<{ accounts: Array<{ id: string; accountType: string; accountName: string | null }>; synced: number }> {
  const awaiting = await getAwaitingConnection(userId);
  if (!awaiting) {
    // Fall back to any live token
    const live = await prisma.account.findFirst({
      where: {
        userId,
        encryptedAccessToken: { not: "demo" },
        NOT: {
          OR: [
            { providerAccountId: { startsWith: "awaiting_" } },
            { providerAccountId: { startsWith: "pending_" } },
          ],
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!live) throw new Error("NO_TOKEN");
    return finalizeLinkFromAccount(userId, live.id, live, options);
  }

  const status = await checkMonzoApproval(awaiting.id);
  if (!status.ready) {
    throw new Error(`NOT_APPROVED:${status.message}`);
  }

  return finalizeLinkFromAccount(userId, awaiting.id, awaiting, options);
}

async function finalizeLinkFromAccount(
  userId: string,
  tokenAccountId: string,
  tokenAccount: {
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
    tokenExpiresAt: Date | null;
    monzoUserId: string | null;
    accountType: string;
  },
  options?: { fullHistory?: boolean }
) {
  const tokens: TokenBundle = {
    encryptedAccessToken: tokenAccount.encryptedAccessToken,
    encryptedRefreshToken: tokenAccount.encryptedRefreshToken,
    tokenExpiresAt: tokenAccount.tokenExpiresAt ?? new Date(Date.now() + 3600_000),
    monzoUserId: tokenAccount.monzoUserId ?? "unknown",
  };

  let monzoAccounts: MonzoAccount[] = [];
  try {
    monzoAccounts = await listMonzoAccounts(tokenAccountId);
  } catch (err) {
    if (err instanceof MonzoApiError) {
      throw new Error(`NOT_APPROVED:${err.message}`);
    }
    throw err;
  }

  if (monzoAccounts.length === 0) throw new Error("NO_ACCOUNTS");

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

  await prisma.account.deleteMany({
    where: {
      userId,
      OR: [
        { providerAccountId: { startsWith: "awaiting_" } },
        { providerAccountId: { startsWith: "pending_" } },
      ],
    },
  });

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
  const wantFull = options?.fullHistory !== false;
  for (const account of linked) {
    try {
      await syncAccountTransactions(account.id, userId, { fullHistory: wantFull });
      synced++;
    } catch (err) {
      console.error(`History sync failed for ${account.id}`, err);
      if (wantFull) {
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

/** @deprecated use storeAwaitingApproval + importAfterApproval */
export async function linkAllMonzoAccounts(
  userId: string,
  tokens: TokenBundle,
  options?: { fullHistory?: boolean; preferredType?: "personal" | "business" }
) {
  await storeAwaitingApproval(userId, tokens, options?.preferredType);
  return importAfterApproval(userId, { fullHistory: options?.fullHistory });
}

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
