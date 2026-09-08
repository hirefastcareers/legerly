import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/encryption";
import { exchangeMonzoCode } from "@/lib/monzo/client";
import { storeAwaitingApproval } from "@/lib/monzo/link-accounts";

/**
 * OAuth callback — store tokens only.
 * Do NOT sync here: Monzo has not granted permissions until the user
 * approves the push notification in the Monzo app (often AFTER this redirect).
 */
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
    await storeAwaitingApproval(
      userId,
      {
        encryptedAccessToken: encryptToken(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token
          ? encryptToken(tokens.refresh_token)
          : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        monzoUserId: tokens.user_id,
      },
      accountType
    );

    await prisma.oAuthState.delete({ where: { id: oauthState.id } }).catch(() => undefined);

    return NextResponse.redirect(new URL("/dashboard?awaiting_approval=1", req.url));
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(new URL("/dashboard?error=oauth_failed", req.url));
  }
}
