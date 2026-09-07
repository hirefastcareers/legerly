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
      await prisma.transactionTag.createMany({
        data: (body.transactionIds as string[]).flatMap((tid) =>
          (body.tagIds as string[]).map((tagId) => ({ transactionId: tid, tagId }))
        ),
        skipDuplicates: true,
      });
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
