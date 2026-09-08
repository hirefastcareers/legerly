import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();
    const tags = await prisma.tag.findMany({ where: { userId }, orderBy: { name: "asc" } });
    return NextResponse.json({ tags });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    if (body.action === "assign") {
      const pairs = (body.transactionIds as string[]).flatMap((tid) =>
        (body.tagIds as string[]).map((tagId) => ({ transactionId: tid, tagId }))
      );

      if (pairs.length > 0) {
        const existing = await prisma.transactionTag.findMany({
          where: { OR: pairs },
          select: { transactionId: true, tagId: true },
        });
        const existingKeys = new Set(existing.map((row) => `${row.transactionId}:${row.tagId}`));
        const toCreate = pairs.filter((pair) => !existingKeys.has(`${pair.transactionId}:${pair.tagId}`));
        if (toCreate.length > 0) {
          await prisma.transactionTag.createMany({ data: toCreate });
        }
      }

      return NextResponse.json({ ok: true });
    }

    const tag = await prisma.tag.create({
      data: {
        userId,
        name: body.name.startsWith("#") ? body.name : `#${body.name}`,
        color: body.color ?? "#0d9488",
      },
    });
    return NextResponse.json({ tag });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
