import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { isAiEnabled } from "@/lib/config";
import { parseBankCsv } from "@/lib/statements/parse-csv";
import { extractPdfText, parseStatementWithAi } from "@/lib/statements/parse-ai";
import { importParsedStatement } from "@/lib/statements/import";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireUserId();
    return NextResponse.json({
      aiEnabled: isAiEnabled(),
      accepted: [".csv", ".tsv", ".txt", ".pdf", "image/png", "image/jpeg", "image/webp"],
      tip: "Best free path: Monzo app → account → Statement → Download CSV. PDF/photo scan needs ENABLE_AI=true.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const form = await req.formData();
    const file = form.get("file");
    const accountType =
      form.get("accountType") === "business" ? ("business" as const) : ("personal" as const);
    const useAi = form.get("useAi") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a statement file" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    const mime = (file.type || "").toLowerCase();

    let parsed;
    if (name.endsWith(".csv") || name.endsWith(".tsv") || mime.includes("csv") || mime.includes("tsv")) {
      parsed = parseBankCsv(buf.toString("utf8"));
    } else if (name.endsWith(".txt") || mime.startsWith("text/")) {
      // Prefer CSV parse; if it looks unstructured, fall through to AI
      const text = buf.toString("utf8");
      const asCsv = parseBankCsv(text);
      if (asCsv.rows.length > 0) {
        parsed = asCsv;
      } else if (useAi || isAiEnabled()) {
        parsed = await parseStatementWithAi({ text });
      } else {
        return NextResponse.json(
          {
            error:
              "Could not parse that text as CSV. Export a Monzo CSV, or enable AI (ENABLE_AI=true) to scan free-form statements.",
          },
          { status: 400 }
        );
      }
    } else if (name.endsWith(".pdf") || mime === "application/pdf") {
      if (!isAiEnabled() && !useAi) {
        return NextResponse.json(
          {
            error:
              "PDF scan needs AI. Either set ENABLE_AI=true + OPENAI_API_KEY, or download a CSV from Monzo (free).",
            aiEnabled: false,
          },
          { status: 400 }
        );
      }
      const text = await extractPdfText(buf);
      if (!text.trim()) {
        return NextResponse.json(
          { error: "Could not read text from that PDF. Try a Monzo CSV or a clearer statement export." },
          { status: 400 }
        );
      }
      parsed = await parseStatementWithAi({ text });
    } else if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
      if (!isAiEnabled()) {
        return NextResponse.json(
          {
            error:
              "Photo statement scan needs AI. Set ENABLE_AI=true + OPENAI_API_KEY, or upload a CSV instead.",
            aiEnabled: false,
          },
          { status: 400 }
        );
      }
      parsed = await parseStatementWithAi({
        imageBase64: buf.toString("base64"),
        mimeType: mime || "image/png",
      });
    } else {
      return NextResponse.json(
        {
          error: "Unsupported file. Upload a Monzo CSV, PDF statement, or statement photo.",
        },
        { status: 400 }
      );
    }

    if (!parsed.rows.length) {
      return NextResponse.json(
        {
          error: "No transactions found in that file.",
          warnings: parsed.warnings,
          format: parsed.format,
        },
        { status: 400 }
      );
    }

    const result = await importParsedStatement(userId, parsed, {
      accountType,
      useAiCategorise: useAi && isAiEnabled(),
    });

    return NextResponse.json({
      ok: true,
      ...result,
      message: `Imported ${result.imported} transaction(s)${
        result.duplicates ? `, skipped ${result.duplicates} duplicate(s)` : ""
      }.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error("statement import", e);
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
