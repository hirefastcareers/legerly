import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { parseTaxYearLabel, getTaxYear } from "@/lib/tax/tax-year";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const sp = req.nextUrl.searchParams;
    const taxYearLabel = sp.get("taxYear") ?? getTaxYear().label;
    const taxYear = parseTaxYearLabel(taxYearLabel);
    const status = sp.get("status");
    const accountType = sp.get("accountType");
    const source = sp.get("source");
    const q = sp.get("q");

    const accounts =
      accountType && accountType !== "all"
        ? await prisma.account.findMany({
            where: { userId, accountType },
            select: { id: true },
          })
        : null;

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        created: { gte: taxYear.start, lte: taxYear.end },
        ...(status && status !== "all" ? { status } : {}),
        ...(source && source !== "all" ? { source } : {}),
        ...(accounts ? { accountId: { in: accounts.map((a) => a.id) } } : {}),
        ...(q
          ? {
              OR: [
                { description: { contains: q } },
                { merchantName: { contains: q } },
                { notes: { contains: q } },
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
    });

    return NextResponse.json({ transactions, taxYear: taxYearLabel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
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
    if (body.hmrcCategory !== undefined || body.businessPercent !== undefined) {
      data.status = data.status ?? "overridden";
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
