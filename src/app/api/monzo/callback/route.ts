import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/encryption";
import { exchangeMonzoCode, inferAccountType, listMonzoAccounts } from "@/lib/monzo/client";
import { syncAccountTransactions } from "@/lib/monzo/sync";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL("/dashboard?error=missing_oauth", req.url));
  }

  const [accountType, state] = stateParam.includes(":")
    ? (stateParam.split(":") as ["personal" | "business", string])
    : (["personal", stateParam] as const);

  const oauthState = await prisma.oAuthState.findUnique({ where: { state } });
  if (!oauthState || oauthState.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/dashboard?error=invalid_state", req.url));
  }

  const userId = oauthState.userId;
  if (!userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const tokens = await exchangeMonzoCode(code);
    const encryptedAccess = encryptToken(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : null;

    // Temporarily store tokens on a placeholder to call /accounts
    const temp = await prisma.account.create({
      data: {
        userId,
        provider: "monzo",
        providerAccountId: `pending_${tokens.user_id}_${Date.now()}`,
        accountType,
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        monzoUserId: tokens.user_id,
      },
    });

    const monzoAccounts = await listMonzoAccounts(temp.id);
    const preferred =
      monzoAccounts.find((a) => inferAccountType(a) === accountType) ?? monzoAccounts[0];

    if (!preferred) {
      await prisma.account.delete({ where: { id: temp.id } });
      return NextResponse.redirect(new URL("/dashboard?error=no_accounts", req.url));
    }

    // Upsert real account and remove temp if IDs differ
    const saved = await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: "monzo",
          providerAccountId: preferred.id,
        },
      },
      update: {
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        accountType: inferAccountType(preferred),
        accountName: preferred.description,
        description: preferred.description,
        monzoUserId: tokens.user_id,
      },
      create: {
        userId,
        provider: "monzo",
        providerAccountId: preferred.id,
        accountType: inferAccountType(preferred),
        accountName: preferred.description,
        description: preferred.description,
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        monzoUserId: tokens.user_id,
      },
    });

    if (temp.id !== saved.id) {
      await prisma.account.delete({ where: { id: temp.id } }).catch(() => undefined);
    }

    await prisma.oAuthState.delete({ where: { id: oauthState.id } }).catch(() => undefined);

    // Drop any previously seeded demo accounts/transactions for this user
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
      await prisma.account.deleteMany({
        where: { id: { in: demoAccounts.map((a) => a.id) } },
      });
    }
    await prisma.transaction.deleteMany({
      where: { userId, monzoTransactionId: { startsWith: "demo_" } },
    });

    // Initial sync right after SCA — try longer history, fall back to 90 days
    await syncAccountTransactions(saved.id, userId, { fullHistory: true }).catch(console.error);

    return NextResponse.redirect(
      new URL(`/dashboard?connected=${saved.accountType}`, req.url)
    );
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(new URL("/dashboard?error=oauth_failed", req.url));
  }
}
