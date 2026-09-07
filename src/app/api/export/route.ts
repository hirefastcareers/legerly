import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { buildTaxSummary } from "@/lib/tax/summary";
import { getTaxYear } from "@/lib/tax/tax-year";
import { HMRC_CATEGORIES } from "@/lib/tax/hmrc-categories";
import { formatGBP } from "@/lib/utils";
import JSZip from "jszip";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const format = req.nextUrl.searchParams.get("format") ?? "csv";
    const taxYear = req.nextUrl.searchParams.get("taxYear") ?? getTaxYear().label;
    const summary = await buildTaxSummary(userId, taxYear);

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        created: { gte: summary.taxYear.start, lte: summary.taxYear.end },
      },
      include: { account: true, receipts: true },
      orderBy: { created: "asc" },
    });

    if (format === "csv") {
      const header = [
        "Date",
        "Description",
        "Merchant",
        "Amount GBP",
        "Account",
        "HMRC Category",
        "SA103 Box",
        "Business %",
        "Tax Claimable",
        "Status",
        "Explanation",
      ].join(",");

      const rows = transactions.map((tx) => {
        const cat = tx.hmrcCategory
          ? HMRC_CATEGORIES[tx.hmrcCategory as keyof typeof HMRC_CATEGORIES]
          : null;
        return [
          tx.created.toISOString().slice(0, 10),
          csv(tx.description),
          csv(tx.merchantName ?? ""),
          (tx.amount / 100).toFixed(2),
          csv(tx.account?.accountType ?? ""),
          csv(cat?.label ?? ""),
          csv(cat?.sa103Box ?? ""),
          tx.businessPercent,
          tx.isTaxClaimable,
          tx.status,
          csv(tx.aiExplanation ?? ""),
        ].join(",");
      });

      const csvBody = [header, ...rows].join("\n");
      return new NextResponse(csvBody, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="sa103-${taxYear}.csv"`,
        },
      });
    }

    if (format === "sa103") {
      const lines = [
        `HMRC Self Assessment SA103 Category Summary`,
        `Tax year: ${taxYear}`,
        `Generated: ${new Date().toISOString()}`,
        ``,
        `Turnover: ${formatGBP(summary.estimate.turnover)}`,
        `Allowable expenses: ${formatGBP(summary.estimate.allowableExpenses)}`,
        `Capital allowances: ${formatGBP(summary.estimate.capitalAllowances)}`,
        `Mileage allowance: ${formatGBP(summary.estimate.mileageAllowance)}`,
        `WFH simplified: ${formatGBP(summary.estimate.wfhAllowance)}`,
        `Net profit: ${formatGBP(summary.estimate.netProfit)}`,
        `Est. Income Tax: ${formatGBP(summary.estimate.incomeTax)}`,
        `Est. Class 4 NI: ${formatGBP(summary.estimate.class4NI)}`,
        `Est. total liability: ${formatGBP(summary.estimate.totalLiability)}`,
        `Suggested monthly Tax Pot: ${formatGBP(summary.estimate.monthlyTaxPot)}`,
        ``,
        `Box,Category,Total,Transactions`,
        ...summary.boxes.map(
          (b) => `${b.sa103Box},${b.label},${(b.totalPence / 100).toFixed(2)},${b.count}`
        ),
      ];
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": `attachment; filename="sa103-summary-${taxYear}.txt"`,
        },
      });
    }

    if (format === "pdf") {
      // Lightweight text-based PDF summary via plain response labelled for download;
      // full jsPDF rendering on server can be heavy — produce structured text PDF-ready content.
      const { jsPDF } = await import("jspdf");
      await import("jspdf-autotable");
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("UK Self Assessment Tax Summary", 14, 20);
      doc.setFontSize(11);
      doc.text(`Tax year ${taxYear}`, 14, 28);
      doc.text(`Turnover: ${formatGBP(summary.estimate.turnover)}`, 14, 40);
      doc.text(`Allowable expenses: ${formatGBP(summary.estimate.allowableExpenses)}`, 14, 48);
      doc.text(`Net profit: ${formatGBP(summary.estimate.netProfit)}`, 14, 56);
      doc.text(`Income Tax: ${formatGBP(summary.estimate.incomeTax)}`, 14, 64);
      doc.text(`Class 4 NI: ${formatGBP(summary.estimate.class4NI)}`, 14, 72);
      doc.text(`Total liability: ${formatGBP(summary.estimate.totalLiability)}`, 14, 80);
      doc.text(`Monthly Tax Pot suggestion: ${formatGBP(summary.estimate.monthlyTaxPot)}`, 14, 88);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        startY: 100,
        head: [["SA103 Box", "Category", "Total", "Count"]],
        body: summary.boxes.map((b) => [
          b.sa103Box,
          b.label,
          formatGBP(b.totalPence),
          String(b.count),
        ]),
      });

      const buf = Buffer.from(doc.output("arraybuffer"));
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="tax-summary-${taxYear}.pdf"`,
        },
      });
    }

    if (format === "receipts-zip") {
      const zip = new JSZip();
      const receipts = await prisma.receipt.findMany({
        where: { userId },
        include: { transaction: true },
      });

      for (const receipt of receipts) {
        const tx = receipt.transaction;
        const month = tx
          ? tx.created.toISOString().slice(0, 7)
          : receipt.createdAt.toISOString().slice(0, 7);
        const cat = tx?.hmrcCategory ?? "uncategorised";
        try {
          const abs = path.join(process.cwd(), receipt.storagePath);
          const data = await readFile(abs);
          zip.file(`${month}/${cat}/${receipt.filename}`, data);
        } catch {
          zip.file(
            `${month}/${cat}/${receipt.filename}.missing.txt`,
            `File missing: ${receipt.storagePath}`
          );
        }
      }

      const content = await zip.generateAsync({ type: "arraybuffer" });
      return new NextResponse(content, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="receipts-${taxYear}.zip"`,
        },
      });
    }

    return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

function csv(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
