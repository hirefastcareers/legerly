import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncAccountTransactions } from "@/lib/monzo/sync";
import { requireUserId } from "@/lib/session";
import { seedDemoTransactions } from "@/lib/demo-data";

export async function POST() {
  try {
    const userId = await requireUserId();
    const accounts = await prisma.account.findMany({ where: { userId } });

    if (accounts.length === 0 || accounts.every((a) => a.encryptedAccessToken === "demo")) {
      const result = await seedDemoTransactions(userId);
      return NextResponse.json({ ok: true, demo: true, ...result });
    }

    const results = [];
    for (const account of accounts) {
      if (account.encryptedAccessToken === "demo") {
        results.push({ accountId: account.id, demo: true });
        continue;
      }
      const r = await syncAccountTransactions(account.id, userId);
      results.push({ accountId: account.id, ...r });
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
