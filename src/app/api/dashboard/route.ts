import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { getTaxYear } from "@/lib/tax/tax-year";
import { buildTaxSummary } from "@/lib/tax/summary";

export async function GET() {
  try {
    const userId = await requireUserId();
    const taxYear = getTaxYear().label;
    const [summary, accounts, recent, pending] = await Promise.all([
      buildTaxSummary(userId, taxYear),
      prisma.account.findMany({ where: { userId } }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { created: "desc" },
        take: 8,
        include: { account: true },
      }),
      prisma.transaction.count({ where: { userId, status: "pending" } }),
    ]);

    return NextResponse.json({
      summary,
      accounts,
      recent,
      pending,
      taxYear,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
