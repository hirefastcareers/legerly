import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncAccountTransactions } from "@/lib/monzo/sync";
import { requireUserId } from "@/lib/session";
import { seedDemoTransactions } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/config";

export async function POST() {
  try {
    const userId = await requireUserId();
    const accounts = await prisma.account.findMany({ where: { userId } });
    const liveAccounts = accounts.filter((a) => a.encryptedAccessToken !== "demo");

    // Never invent fake transactions in production
    if (liveAccounts.length === 0) {
      if (isDemoMode()) {
        const result = await seedDemoTransactions(userId);
        return NextResponse.json({ ok: true, demo: true, ...result });
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "No live Monzo accounts connected. Click Connect Personal / Business and approve access in the Monzo app, then sync again.",
        },
        { status: 400 }
      );
    }

    const results = [];
    for (const account of liveAccounts) {
      try {
        const r = await syncAccountTransactions(account.id, userId);
        results.push({ accountId: account.id, accountType: account.accountType, ...r });
      } catch (err) {
        const message = err instanceof Error ? err.message : "sync failed";
        results.push({
          accountId: account.id,
          accountType: account.accountType,
          error: message,
        });
      }
    }

    const failed = results.filter((r) => "error" in r && r.error);
    return NextResponse.json({
      ok: failed.length === 0,
      results,
      hint:
        failed.length > 0
          ? "If Monzo returned forbidden/unauthorized, open the Monzo app and approve API access for this client, then reconnect."
          : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
