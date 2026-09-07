import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { categoriseTransaction } from "@/lib/tax/rules-engine";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const ids: string[] = body.ids ?? [];
    const useAi = body.useAi !== false;

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        ...(ids.length ? { id: { in: ids } } : { status: "pending" }),
      },
      take: 50,
    });

    const results = [];
    for (const tx of transactions) {
      const cat = await categoriseTransaction({
        description: tx.description,
        merchantName: tx.merchantName,
        amount: tx.amount,
        monzoCategory: tx.monzoCategory,
        useAi,
      });

      const updated = await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          hmrcCategory: cat.hmrcCategory,
          businessPercent: cat.businessPercent,
          isTaxClaimable: cat.isTaxClaimable,
          aiConfidence: cat.confidence,
          aiExplanation: `[${cat.source}] ${cat.explanation}`,
          isExcluded: Boolean(cat.isExcluded),
          isPotTransfer: Boolean(cat.isExcluded),
          isIncome: cat.hmrcCategory === "income" || tx.amount > 0,
          status: cat.confidence >= 0.9 ? "confirmed" : "pending",
        },
      });
      results.push(updated);
    }

    return NextResponse.json({ categorised: results.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
