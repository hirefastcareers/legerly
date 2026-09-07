import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { parseReceiptOcr } from "@/lib/ai/categorise";

export async function GET() {
  try {
    const userId = await requireUserId();
    const receipts = await prisma.receipt.findMany({
      where: { userId },
      include: { transaction: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ receipts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const transactionId = (form.get("transactionId") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploadDir = path.join(process.cwd(), "uploads", userId);
    await mkdir(uploadDir, { recursive: true });
    const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = path.join(uploadDir, filename);
    await writeFile(storagePath, bytes);

    let ocr = { total: null as number | null, date: null as string | null, merchant: null as string | null, raw: "" };
    if (file.type.startsWith("image/")) {
      try {
        ocr = await parseReceiptOcr(bytes.toString("base64"), file.type);
      } catch (err) {
        ocr.raw = err instanceof Error ? err.message : "OCR failed";
      }
    }

    // Auto-match transaction by amount/date if not provided
    let matchedId = transactionId;
    if (!matchedId && ocr.total != null) {
      const pence = Math.round(ocr.total * 100);
      const match = await prisma.transaction.findFirst({
        where: {
          userId,
          OR: [{ amount: -pence }, { amount: pence }],
          ...(ocr.date
            ? {
                created: {
                  gte: new Date(new Date(ocr.date).getTime() - 86400000 * 2),
                  lte: new Date(new Date(ocr.date).getTime() + 86400000 * 2),
                },
              }
            : {}),
        },
        orderBy: { created: "desc" },
      });
      matchedId = match?.id ?? null;
    }

    const receipt = await prisma.receipt.create({
      data: {
        userId,
        transactionId: matchedId,
        filename: file.name,
        mimeType: file.type,
        storagePath: `uploads/${userId}/${filename}`,
        ocrTotal: ocr.total,
        ocrDate: ocr.date ? new Date(ocr.date) : null,
        ocrMerchant: ocr.merchant,
        ocrRaw: ocr.raw,
      },
      include: { transaction: true },
    });

    return NextResponse.json({ receipt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
