import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { SYSTEM_RULES } from "@/lib/tax/hmrc-categories";

export async function GET() {
  try {
    await requireUserId();
    let rules = await prisma.rule.findMany({ orderBy: [{ isSystem: "desc" }, { priority: "asc" }] });
    if (rules.length === 0) {
      await prisma.rule.createMany({
        data: SYSTEM_RULES.map((r) => ({
          merchantMatch: r.merchantMatch,
          matchType: r.matchType,
          hmrcCategory: r.hmrcCategory,
          businessPercent: r.businessPercent,
          isTaxClaimable: r.isTaxClaimable,
          isSystem: true,
          priority: r.priority,
          explanation: r.explanation,
        })),
      });
      rules = await prisma.rule.findMany({ orderBy: [{ isSystem: "desc" }, { priority: "asc" }] });
    }
    return NextResponse.json({ rules });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const rule = await prisma.rule.create({
      data: {
        userId,
        merchantMatch: body.merchantMatch,
        matchType: body.matchType ?? "contains",
        hmrcCategory: body.hmrcCategory,
        businessPercent: Number(body.businessPercent ?? 100),
        isTaxClaimable: body.isTaxClaimable !== false,
        isSystem: false,
        priority: Number(body.priority ?? 50),
        explanation: body.explanation ?? null,
      },
    });
    return NextResponse.json({ rule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const rule = await prisma.rule.findFirst({ where: { id, OR: [{ userId }, { isSystem: false }] } });
    if (!rule || rule.isSystem) {
      return NextResponse.json({ error: "Cannot delete system rules" }, { status: 400 });
    }
    await prisma.rule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
