import OpenAI from "openai";
import type { ParsedStatementRow, StatementParseResult } from "@/lib/statements/types";
import { isAiEnabled } from "@/lib/config";

function parseLooseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const uk = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (uk) {
    let year = Number(uk[3]);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, Number(uk[2]) - 1, Number(uk[1]), 12));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = new Date(s);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

type AiLine = {
  date?: string;
  description?: string;
  merchant?: string;
  amount_gbp?: number;
  direction?: "in" | "out";
};

/**
 * Use AI to turn statement text (or OCR-ish dump) into structured rows.
 * Gated by ENABLE_AI + OPENAI_API_KEY.
 */
export async function parseStatementWithAi(input: {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<StatementParseResult> {
  if (!isAiEnabled()) {
    return {
      rows: [],
      format: "ai_statement",
      warnings: [
        "AI statement scan is off. Set ENABLE_AI=true and OPENAI_API_KEY, or upload a Monzo CSV instead (free).",
      ],
    };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const instruction = `Extract every bank statement transaction line as JSON:
{"transactions":[{"date":"YYYY-MM-DD","description":"string","merchant":"string","amount_gbp":number,"direction":"in"|"out"}]}
Rules:
- amount_gbp is always positive; use direction for money in vs out
- Include transfers, card payments, standing orders, Direct Debits
- Skip balances, headers, page numbers, and interest rate blurbs
- UK sole trader gardener context is fine; do not invent lines
- Reply with JSON only`;

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: instruction },
  ];

  if (input.text?.trim()) {
    content.push({
      type: "text",
      text: `Statement text:\n${input.text.slice(0, 120_000)}`,
    });
  }
  if (input.imageBase64 && input.mimeType) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
    });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You extract UK bank statement transactions. Reply with JSON only.",
      },
      { role: "user", content },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    transactions?: AiLine[];
  };
  const warnings: string[] = [];
  const rows: ParsedStatementRow[] = [];

  for (const line of parsed.transactions ?? []) {
    const date = parseLooseDate(String(line.date ?? ""));
    if (!date) {
      warnings.push(`AI line skipped — bad date: ${line.date}`);
      continue;
    }
    const abs = Math.round(Math.abs(Number(line.amount_gbp ?? 0)) * 100);
    if (!abs) {
      warnings.push(`AI line skipped — zero amount: ${line.description}`);
      continue;
    }
    const direction = line.direction === "in" ? 1 : -1;
    rows.push({
      date,
      description: String(line.description || line.merchant || "Statement line"),
      merchantName: line.merchant ? String(line.merchant) : null,
      amountPence: abs * direction,
      currency: "GBP",
      notes: null,
      externalId: null,
      accountHint: null,
    });
  }

  return { rows, format: "ai_statement", warnings: warnings.slice(0, 20) };
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse has no perfect ESM types in Next; require keeps it simple on server
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (data: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text ?? "";
}
