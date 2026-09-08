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
    const accounts = await prisma.account.findMany({
      where: {
        userId,
        encryptedAccessToken: { not: "demo" },
        NOT: {
          OR: [
            { providerAccountId: { startsWith: "pending_" } },
            { providerAccountId: { startsWith: "awaiting_" } },
          ],
        },
      },
    });

    // Deduplicate by Monzo account id (avoid syncing same feed twice)
    const unique = Array.from(new Map(accounts.map((a) => [a.providerAccountId, a])).values());

    if (unique.length === 0) {
      if (isDemoMode()) {
        const result = await seedDemoTransactions(userId);
        return NextResponse.json({ ok: true, demo: true, ...result });
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "No live Monzo accounts connected. Click Connect Monzo, approve in the app, and wait for the first full import to finish.",
        },
        { status: 400 }
      );
    }

    const results = [];
    for (const account of unique) {
      try {
        // Incremental sync — full tax-year history is imported on Connect (SCA window)
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
    const firstHint = failed.find((r) => "hint" in r && r.hint)?.hint as string | undefined;
    const eviction = failed.some((r) =>
      /evicted|login elsewhere/i.test(String((r as { error?: string }).error ?? ""))
    );

    return NextResponse.json({
      ok: failed.length === 0,
      results,
      error: failed.length
        ? failed.map((r) => `${r.accountType}: ${r.error}`).join(" · ")
        : undefined,
      hint:
        firstHint ||
        (eviction
          ? "Monzo only allows one active login token. Use a single Connect Monzo (not separate Personal then Business). Reconnect once, approve in the app, and let the full import finish."
          : failed.length
            ? "Reconnect Monzo once to refresh access, then Sync again."
            : undefined),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
