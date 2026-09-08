import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { parseTaxYearLabel, getTaxYear, listTaxYears } from "@/lib/tax/tax-year";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const sp = req.nextUrl.searchParams;
    const taxYearLabel = sp.get("taxYear") ?? "all";
    const status = sp.get("status");
    const accountType = sp.get("accountType");
    const source = sp.get("source");
    const q = sp.get("q");
    const includeExcluded = sp.get("includeExcluded") === "true";

    const accounts =
      accountType && accountType !== "all"
        ? await prisma.account.findMany({
            where: { userId, accountType },
            select: { id: true },
          })
        : null;

    const dateFilter =
      taxYearLabel && taxYearLabel !== "all"
        ? (() => {
            const taxYear = parseTaxYearLabel(taxYearLabel);
            return { created: { gte: taxYear.start, lte: taxYear.end } };
          })()
        : {};

    const statusFilter =
      status === "needs_review"
        ? { status: "pending" }
        : status === "reviewed"
          ? { status: { in: ["confirmed", "overridden"] } }
          : status && status !== "all"
            ? { status }
            : {};

    const [transactions, totalImported, pendingCount] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId,
          ...dateFilter,
          ...statusFilter,
          ...(source && source !== "all" ? { source } : {}),
          ...(accounts ? { accountId: { in: accounts.map((a) => a.id) } } : {}),
          ...(includeExcluded ? {} : {}),
          ...(q
            ? {
                OR: [
                  { description: { contains: q, mode: "insensitive" } },
                  { merchantName: { contains: q, mode: "insensitive" } },
                  { notes: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          account: { select: { accountType: true, accountName: true } },
          tags: { include: { tag: true } },
          receipts: true,
        },
        orderBy: { created: "desc" },
      }),
      prisma.transaction.count({ where: { userId } }),
      prisma.transaction.count({ where: { userId, status: "pending" } }),
    ]);

    return NextResponse.json({
      transactions,
      taxYear: taxYearLabel === "all" ? "all" : taxYearLabel,
      availableYears: ["all", ...listTaxYears(6).map((y) => y.label)],
      counts: {
        shown: transactions.length,
        totalImported,
        pending: pendingCount,
        currentTaxYear: getTaxYear().label,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    // Reset everything (or filtered ids) back to needs-review
    if (body.action === "send_all_to_review") {
      const result = await prisma.transaction.updateMany({
        where: {
          userId,
          status: { in: ["confirmed", "overridden"] },
        },
        data: { status: "pending" },
      });
      return NextResponse.json({ updated: result.count });
    }

    const ids: string[] = body.ids ?? (body.id ? [body.id] : []);
    if (ids.length === 0) {
      return NextResponse.json({ error: "No ids" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.hmrcCategory !== undefined) data.hmrcCategory = body.hmrcCategory;
    if (body.businessPercent !== undefined) data.businessPercent = Number(body.businessPercent);
    if (body.isTaxClaimable !== undefined) data.isTaxClaimable = Boolean(body.isTaxClaimable);
    if (body.status !== undefined) data.status = body.status;
    if (body.isExcluded !== undefined) data.isExcluded = Boolean(body.isExcluded);
    if (body.isIncome !== undefined) data.isIncome = Boolean(body.isIncome);
    if (body.notes !== undefined) data.notes = body.notes;

    if (body.confirm) {
      data.status = "confirmed";
    }
    // Changing category/split counts as you reviewing it
    if (
      (body.hmrcCategory !== undefined || body.businessPercent !== undefined) &&
      !body.confirm &&
      body.status === undefined
    ) {
      data.status = "overridden";
    }

    const result = await prisma.transaction.updateMany({
      where: { id: { in: ids }, userId },
      data,
    });

    return NextResponse.json({ updated: result.count });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
