import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getMonzoAuthUrl } from "@/lib/monzo/client";
import { requireUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const accountType = (req.nextUrl.searchParams.get("type") ?? "personal") as
      | "personal"
      | "business";

    // Demo mode when Monzo credentials are not configured
    if (!process.env.MONZO_CLIENT_ID) {
      await prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: "monzo",
            providerAccountId: `demo_${accountType}_${userId}`,
          },
        },
        update: {
          accountType,
          accountName:
            accountType === "business" ? "Monzo Business (Demo)" : "Monzo Personal (Demo)",
        },
        create: {
          userId,
          provider: "monzo",
          providerAccountId: `demo_${accountType}_${userId}`,
          accountType,
          accountName:
            accountType === "business" ? "Monzo Business (Demo)" : "Monzo Personal (Demo)",
          description: "Demo account",
          encryptedAccessToken: "demo",
          encryptedRefreshToken: "demo",
          tokenExpiresAt: new Date(Date.now() + 86400000 * 365),
        },
      });
      return NextResponse.redirect(new URL(`/dashboard?connected=${accountType}`, req.url));
    }

    const state = randomBytes(16).toString("hex");
    await prisma.oAuthState.create({
      data: {
        state,
        accountType,
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return NextResponse.redirect(getMonzoAuthUrl(state, accountType));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
