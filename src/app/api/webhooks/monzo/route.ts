import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { upsertMonzoTransaction } from "@/lib/monzo/sync";
import type { MonzoTransaction } from "@/lib/monzo/client";

/**
 * Monzo webhook listener — fires on transaction.created etc.
 * Configure webhook URL in Monzo developer portal to:
 *   https://your-domain/api/webhooks/monzo
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const type = payload?.type as string | undefined;

    // Monzo ping / verification
    if (!type || type === "ping") {
      return NextResponse.json({ ok: true });
    }

    if (type === "transaction.created" || type === "transaction.updated") {
      const tx = payload.data as MonzoTransaction;
      const monzoAccountId = payload.data?.account_id as string | undefined;

      if (!monzoAccountId || !tx?.id) {
        return NextResponse.json({ ok: true, skipped: true });
      }

      const account = await prisma.account.findFirst({
        where: { providerAccountId: monzoAccountId },
      });

      if (!account) {
        return NextResponse.json({ ok: true, unmatched: true });
      }

      await upsertMonzoTransaction(tx, account.userId, account.id);
      return NextResponse.json({ ok: true, synced: tx.id });
    }

    return NextResponse.json({ ok: true, ignored: type });
  } catch (err) {
    console.error("Webhook error", err);
    // Always 200 to avoid Monzo retry storms on bad payloads
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "monzo webhook listener ready" });
}
