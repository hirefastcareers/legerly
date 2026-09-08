import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { SYSTEM_RULES } from "@/lib/tax/hmrc-categories";

/** Ensure all built-in system rules exist (safe to call repeatedly). */
async function ensureSystemRules() {
  const existing = await prisma.rule.findMany({
    where: { isSystem: true },
    select: { merchantMatch: true, matchType: true },
  });
  const have = new Set(existing.map((r) => `${r.matchType}::${r.merchantMatch.toLowerCase()}`));
  const missing = SYSTEM_RULES.filter(
    (r) => !have.has(`${r.matchType}::${r.merchantMatch.toLowerCase()}`)
  );
  if (missing.length) {
    await prisma.rule.createMany({
      data: missing.map((r) => ({
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
  }
  return missing.length;
}

export async function GET() {
  try {
    await requireUserId();
    await ensureSystemRules();
    const rules = await prisma.rule.findMany({
      orderBy: [{ isSystem: "desc" }, { priority: "asc" }],
    });
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

    if (body.action === "ensure_system") {
      const added = await ensureSystemRules();
      return NextResponse.json({ ok: true, added });
    }

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
    const rule = await prisma.rule.findFirst({
      where: { id, OR: [{ userId }, { isSystem: false }] },
    });
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
