import OpenAI from "openai";
import type { CategorisationResult } from "@/lib/tax/rules-engine";
import { HMRC_CATEGORY_LIST, type HmrcCategoryKey } from "@/lib/tax/hmrc-categories";

const CATEGORY_KEYS = HMRC_CATEGORY_LIST.map((c) => c.key).join(", ");

export async function aiCategorise(input: {
  description: string;
  merchantName?: string | null;
  amount: number;
  monzoCategory?: string | null;
}): Promise<CategorisationResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `You are a UK Self Assessment tax assistant for sole traders (SA103F/SA103S).
Classify this bank transaction for allowable business expense purposes under HMRC rules.

Transaction:
- Description: ${input.description}
- Merchant: ${input.merchantName ?? "unknown"}
- Amount (pence, negative=outflow): ${input.amount}
- Monzo category: ${input.monzoCategory ?? "n/a"}

Valid hmrcCategory values: ${CATEGORY_KEYS}

Rules:
- Entertainment / personal food / groceries are generally non_deductible (0%).
- Dual-use items (phone, broadband) may use a businessPercent between 0-100.
- Client entertaining is still usually non_deductible under HMRC.
- Capital equipment (laptops, cameras) → capital_allowances.
- Return JSON only: {"hmrcCategory":"...","businessPercent":number,"isTaxClaimable":boolean,"explanation":"...","confidence":0-1}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You classify UK sole trader expenses. Reply with JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Partial<CategorisationResult>;

  const hmrcCategory = (parsed.hmrcCategory ?? "non_deductible") as HmrcCategoryKey;
  const valid = HMRC_CATEGORY_LIST.some((c) => c.key === hmrcCategory);

  return {
    hmrcCategory: valid ? hmrcCategory : "non_deductible",
    businessPercent: Math.min(100, Math.max(0, Number(parsed.businessPercent ?? 0))),
    isTaxClaimable: Boolean(parsed.isTaxClaimable),
    explanation: String(parsed.explanation ?? "AI classification"),
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5))),
    source: "ai",
  };
}

export async function parseReceiptOcr(base64Image: string, mimeType: string): Promise<{
  total: number | null;
  date: string | null;
  merchant: string | null;
  raw: string;
}> {
  if (!process.env.OPENAI_API_KEY) {
    return { total: null, date: null, merchant: null, raw: "OCR unavailable — set OPENAI_API_KEY" };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: 'Extract receipt fields as JSON: {"total":number_in_gbp,"date":"YYYY-MM-DD","merchant":"string","raw":"brief summary"}',
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64Image}` },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  return {
    total: parsed.total != null ? Number(parsed.total) : null,
    date: parsed.date ?? null,
    merchant: parsed.merchant ?? null,
    raw: parsed.raw ?? JSON.stringify(parsed),
  };
}
