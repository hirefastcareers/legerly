import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { buildTaxSummary } from "@/lib/tax/summary";
import {
  getTaxYear,
  listTaxYears,
  parseTaxYearLabel,
  formatTaxYearRange,
  taxYearSelectOptions,
} from "@/lib/tax/tax-year";
import { prisma } from "@/lib/db";
import { wfhFlatRatePence } from "@/lib/tax/calculator";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const taxYear = req.nextUrl.searchParams.get("taxYear") ?? getTaxYear().label;
    const summary = await buildTaxSummary(userId, taxYear);
    const selected = parseTaxYearLabel(taxYear);
    return NextResponse.json({
      ...summary,
      availableYears: listTaxYears(6).map((y) => y.label),
      yearOptions: taxYearSelectOptions(6),
      dateRange: { label: formatTaxYearRange(selected) },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const taxYear = body.taxYear ?? getTaxYear().label;

    if (body.type === "mileage") {
      const log = await prisma.mileageLog.create({
        data: {
          userId,
          date: new Date(body.date ?? Date.now()),
          miles: Number(body.miles),
          purpose: body.purpose ?? null,
          taxYear,
        },
      });
      return NextResponse.json({ log });
    }

    if (body.type === "wfh") {
      const hours = Number(body.hoursPerMonth);
      const month = String(body.month);
      const log = await prisma.wfhLog.upsert({
        where: { userId_month: { userId, month } },
        update: {
          hoursPerMonth: hours,
          flatRatePence: wfhFlatRatePence(hours),
          taxYear,
        },
        create: {
          userId,
          month,
          hoursPerMonth: hours,
          flatRatePence: wfhFlatRatePence(hours),
          taxYear,
        },
      });
      return NextResponse.json({ log });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
