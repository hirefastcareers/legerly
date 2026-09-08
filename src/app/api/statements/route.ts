import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { isAiEnabled } from "@/lib/config";
import { parseBankCsv } from "@/lib/statements/parse-csv";
import { extractPdfText, parseStatementWithAi } from "@/lib/statements/parse-ai";
import {
  getCombinedCoverage,
  importParsedStatement,
  type ImportFileResult,
} from "@/lib/statements/import";
import type { StatementParseResult } from "@/lib/statements/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    const userId = await requireUserId();
    const coverage = await getCombinedCoverage(userId);
    return NextResponse.json({
      aiEnabled: isAiEnabled(),
      accepted: [".csv", ".tsv", ".txt", ".pdf", "image/png", "image/jpeg", "image/webp"],
      tip: "Upload every Personal CSV into the Personal drop zone and every Business CSV into Business — all tax years in one go. Then review by tax year on Transactions.",
      coverage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

async function parseFile(
  file: File,
  useAi: boolean
): Promise<StatementParseResult> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".tsv") || mime.includes("csv") || mime.includes("tsv")) {
    return parseBankCsv(buf.toString("utf8"));
  }
  if (name.endsWith(".txt") || mime.startsWith("text/")) {
    const text = buf.toString("utf8");
    const asCsv = parseBankCsv(text);
    if (asCsv.rows.length > 0) return asCsv;
    if (useAi || isAiEnabled()) return parseStatementWithAi({ text });
    throw new Error(
      `${file.name}: could not parse as CSV. Export a Monzo CSV, or enable AI for free-form text.`
    );
  }
  if (name.endsWith(".pdf") || mime === "application/pdf") {
    if (!isAiEnabled()) {
      throw new Error(
        `${file.name}: PDF scan needs ENABLE_AI=true + OPENAI_API_KEY, or use a Monzo CSV.`
      );
    }
    const text = await extractPdfText(buf);
    if (!text.trim()) {
      throw new Error(`${file.name}: could not read PDF text. Prefer a Monzo CSV export.`);
    }
    return parseStatementWithAi({ text });
  }
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
    if (!isAiEnabled()) {
      throw new Error(
        `${file.name}: photo scan needs ENABLE_AI=true + OPENAI_API_KEY, or use a CSV.`
      );
    }
    return parseStatementWithAi({
      imageBase64: buf.toString("base64"),
      mimeType: mime || "image/png",
    });
  }
  throw new Error(`${file.name}: unsupported type. Use Monzo CSV, PDF, or photo.`);
}

function collectFiles(
  form: FormData,
  key: string
): File[] {
  return form
    .getAll(key)
    .filter((v): v is File => typeof File !== "undefined" && v instanceof File && v.size > 0);
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const form = await req.formData();
    const useAi = form.get("useAi") === "true";

    const personalFiles = collectFiles(form, "personalFiles");
    const businessFiles = collectFiles(form, "businessFiles");

    // Back-compat: single file + accountType
    const legacy = form.get("file");
    if (legacy instanceof File && legacy.size > 0) {
      const accountType =
        form.get("accountType") === "business" ? ("business" as const) : ("personal" as const);
      if (accountType === "business") businessFiles.push(legacy);
      else personalFiles.push(legacy);
    }

    if (!personalFiles.length && !businessFiles.length) {
      return NextResponse.json(
        {
          error:
            "Add at least one Personal and/or Business statement file. You can upload many CSVs at once for both tax years.",
        },
        { status: 400 }
      );
    }

    const files: Array<{ file: File; accountType: "personal" | "business" }> = [
      ...personalFiles.map((file) => ({ file, accountType: "personal" as const })),
      ...businessFiles.map((file) => ({ file, accountType: "business" as const })),
    ];

    const results: ImportFileResult[] = [];
    for (const { file, accountType } of files) {
      try {
        const parsed = await parseFile(file, useAi);
        if (!parsed.rows.length && parsed.skippedRows === 0) {
          results.push({
            fileName: file.name,
            accountType,
            imported: 0,
            duplicates: 0,
            sourceRows: parsed.sourceRows,
            skippedRows: parsed.skippedRows,
            format: parsed.format,
            warnings: parsed.warnings.length
              ? parsed.warnings
              : ["No transactions found in that file."],
            byTaxYear: {},
            error: "No transactions found",
          });
          continue;
        }
        const result = await importParsedStatement(userId, parsed, {
          accountType,
          useAiCategorise: useAi && isAiEnabled(),
          fileName: file.name,
        });
        results.push(result);
      } catch (err) {
        results.push({
          fileName: file.name,
          accountType,
          imported: 0,
          duplicates: 0,
          sourceRows: 0,
          skippedRows: 0,
          format: "generic_csv",
          warnings: [],
          byTaxYear: {},
          error: err instanceof Error ? err.message : "Import failed",
        });
      }
    }

    const coverage = await getCombinedCoverage(userId);
    const imported = results.reduce((s, r) => s + r.imported, 0);
    const duplicates = results.reduce((s, r) => s + r.duplicates, 0);
    const skippedRows = results.reduce((s, r) => s + r.skippedRows, 0);
    const sourceRows = results.reduce((s, r) => s + r.sourceRows, 0);
    const failed = results.filter((r) => r.error);
    const byTaxYear: Record<string, number> = {};
    for (const r of results) {
      for (const [y, n] of Object.entries(r.byTaxYear)) {
        byTaxYear[y] = (byTaxYear[y] ?? 0) + n;
      }
    }

    return NextResponse.json({
      ok: failed.length === 0 && skippedRows === 0,
      partial: imported > 0 && (failed.length > 0 || skippedRows > 0),
      message: `Imported ${imported} new transaction(s) from ${files.length} file(s)${
        duplicates ? `; ${duplicates} already stored (duplicates skipped)` : ""
      }${skippedRows ? `; ${skippedRows} line(s) could not be parsed — see file details` : ""}.`,
      totals: { imported, duplicates, skippedRows, sourceRows, files: files.length },
      byTaxYear,
      results,
      coverage,
      aiEnabled: isAiEnabled(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error("statement import", e);
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
