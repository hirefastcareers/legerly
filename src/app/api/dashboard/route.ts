import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { getTaxYear } from "@/lib/tax/tax-year";
import { buildTaxSummary } from "@/lib/tax/summary";
import { hasMonzoCredentials, isAiEnabled, isDemoMode } from "@/lib/config";

export async function GET() {
  try {
    const userId = await requireUserId();
    const taxYear = getTaxYear().label;
    const [summary, accounts, recent, pending, demoTxCount] = await Promise.all([
      buildTaxSummary(userId, taxYear),
      prisma.account.findMany({ where: { userId } }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { created: "desc" },
        take: 8,
        include: { account: true },
      }),
      prisma.transaction.count({ where: { userId, status: "pending" } }),
      prisma.transaction.count({
        where: { userId, monzoTransactionId: { startsWith: "demo_" } },
      }),
    ]);

    const liveAccounts = accounts.filter(
      (a) =>
        a.encryptedAccessToken !== "demo" &&
        !a.providerAccountId.startsWith("pending_") &&
        !a.providerAccountId.startsWith("awaiting_")
    );
    const demoAccounts = accounts.filter((a) => a.encryptedAccessToken === "demo");
    const awaitingApproval = accounts.some((a) => a.providerAccountId.startsWith("awaiting_"));

    return NextResponse.json({
      summary,
      accounts: accounts
        .filter((a) => !a.providerAccountId.startsWith("awaiting_"))
        .map((a) => ({
          id: a.id,
          accountType: a.accountType,
          accountName: a.accountName,
          description: a.description,
          monzoUserId: a.monzoUserId,
          isLive:
            a.encryptedAccessToken !== "demo" &&
            !a.providerAccountId.startsWith("pending_") &&
            !a.providerAccountId.startsWith("awaiting_"),
          isDemo: a.encryptedAccessToken === "demo",
        })),
      recent,
      pending,
      taxYear,
      status: {
        monzoConfigured: hasMonzoCredentials(),
        demoMode: isDemoMode(),
        aiEnabled: isAiEnabled(),
        liveAccountCount: liveAccounts.length,
        demoAccountCount: demoAccounts.length,
        demoTransactionCount: demoTxCount,
        monzoUserCount: new Set(liveAccounts.map((a) => a.monzoUserId).filter(Boolean)).size,
        awaitingApproval,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
