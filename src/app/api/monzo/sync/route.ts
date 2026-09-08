import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncAccountTransactions } from "@/lib/monzo/sync";
import { requireUserId } from "@/lib/session";
import { seedDemoTransactions } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/config";
import { MonzoApiError } from "@/lib/monzo/client";

export async function POST() {
  try {
    const userId = await requireUserId();
    const accounts = await prisma.account.findMany({ where: { userId } });
    const liveAccounts = accounts.filter((a) => a.encryptedAccessToken !== "demo");

    if (liveAccounts.length === 0) {
      if (isDemoMode()) {
        const result = await seedDemoTransactions(userId);
        return NextResponse.json({ ok: true, demo: true, ...result });
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "No live Monzo accounts connected. Click Connect Personal / Business, approve the push in the Monzo app, then sync within a few minutes.",
        },
        { status: 400 }
      );
    }

    const results = [];
    for (const account of liveAccounts) {
      try {
        const r = await syncAccountTransactions(account.id, userId, { fullHistory: false });
        results.push({
          accountId: account.id,
          accountType: account.accountType,
          accountName: account.accountName,
          ...r,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "sync failed";
        const hint = err instanceof MonzoApiError ? err.userHint : undefined;
        results.push({
          accountId: account.id,
          accountType: account.accountType,
          accountName: account.accountName,
          error: message,
          hint,
        });
      }
    }

    const failed = results.filter((r) => "error" in r && r.error);
    const firstHint = failed.find((r) => "hint" in r && r.hint)?.hint;
    return NextResponse.json({
      ok: failed.length === 0,
      results,
      error: failed.length
        ? failed.map((r) => `${r.accountType}: ${r.error}`).join(" · ")
        : undefined,
      hint:
        firstHint ||
        (failed.length
          ? "In Monzo: Profile → Settings → Manage apps → open Ledgerly → refresh access, then Sync again."
          : undefined),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
