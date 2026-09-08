import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/encryption";
import { exchangeMonzoCode } from "@/lib/monzo/client";
import { linkAllMonzoAccounts } from "@/lib/monzo/link-accounts";

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

    const result = await linkAllMonzoAccounts(
      userId,
      {
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        monzoUserId: tokens.user_id,
      },
      { fullHistory: true, preferredType: accountType }
    );

    await prisma.oAuthState.delete({ where: { id: oauthState.id } }).catch(() => undefined);

    const types = Array.from(new Set(result.accounts.map((a) => a.accountType))).join(",");
    return NextResponse.redirect(
      new URL(
        `/dashboard?connected=${encodeURIComponent(types || "monzo")}&synced=${result.synced}&accounts=${result.accounts.length}`,
        req.url
      )
    );
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "";
    if (msg === "NO_ACCOUNTS") {
      return NextResponse.redirect(new URL("/dashboard?error=no_accounts", req.url));
    }
    return NextResponse.redirect(new URL("/dashboard?error=oauth_failed", req.url));
  }
}
