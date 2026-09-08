import { prisma } from "@/lib/db";
import { SYSTEM_RULES, type HmrcCategoryKey } from "@/lib/tax/hmrc-categories";

export type CategorisationResult = {
  hmrcCategory: HmrcCategoryKey;
  businessPercent: number;
  isTaxClaimable: boolean;
  explanation: string;
  confidence: number;
  source: "rule" | "ai" | "heuristic";
  isExcluded?: boolean;
};

function matchText(haystack: string, needle: string, matchType: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (matchType === "exact") return h === n;
  if (matchType === "starts_with") return h.startsWith(n);
  return h.includes(n);
}

export async function applyRulesEngine(
  description: string,
  merchantName?: string | null
): Promise<CategorisationResult | null> {
  const text = `${merchantName ?? ""} ${description}`.trim();

  const dbRules = await prisma.rule.findMany({
    orderBy: { priority: "asc" },
  });

  const allRules = [
    ...dbRules.map((r) => ({
      merchantMatch: r.merchantMatch,
      matchType: r.matchType,
      hmrcCategory: r.hmrcCategory as HmrcCategoryKey,
      businessPercent: r.businessPercent,
      isTaxClaimable: r.isTaxClaimable,
      explanation: r.explanation ?? "Matched custom rule",
      priority: r.priority,
    })),
    ...SYSTEM_RULES,
  ].sort((a, b) => a.priority - b.priority);

  for (const rule of allRules) {
    if (matchText(text, rule.merchantMatch, rule.matchType)) {
      const isPot =
        rule.merchantMatch.toLowerCase().includes("pot") ||
        text.toLowerCase().includes("pot_");
      return {
        hmrcCategory: rule.hmrcCategory,
        businessPercent: rule.businessPercent,
        isTaxClaimable: rule.isTaxClaimable,
        explanation: rule.explanation,
        confidence: 1,
        source: "rule",
        isExcluded: isPot,
      };
    }
  }
  return null;
}

/** Heuristic fallback when no rule / AI available */
export function heuristicCategorise(
  description: string,
  merchantName: string | null | undefined,
  amount: number
): CategorisationResult {
  const text = `${merchantName ?? ""} ${description}`.toLowerCase();

  if (text.includes("pot") || text.includes("transfer")) {
    return {
      hmrcCategory: "non_deductible",
      businessPercent: 0,
      isTaxClaimable: false,
      explanation: "Likely internal transfer — excluded from tax calculation",
      confidence: 0.7,
      source: "heuristic",
      isExcluded: true,
    };
  }

  // Positive amount = money in → income candidate
  if (amount > 0) {
    return {
      hmrcCategory: "income",
      businessPercent: 100,
      isTaxClaimable: false,
      explanation: "Inbound payment — review as turnover if business income",
      confidence: 0.5,
      source: "heuristic",
    };
  }

  return {
    hmrcCategory: "non_deductible",
    businessPercent: 0,
    isTaxClaimable: false,
    explanation: "Ambiguous transaction — needs review",
    confidence: 0.3,
    source: "heuristic",
  };
}

export async function categoriseTransaction(input: {
  description: string;
  merchantName?: string | null;
  amount: number;
  monzoCategory?: string | null;
  useAi?: boolean;
}): Promise<CategorisationResult> {
  const ruleHit = await applyRulesEngine(input.description, input.merchantName);
  if (ruleHit) return ruleHit;

  const { isAiEnabled } = await import("@/lib/config");
  if (input.useAi === true && isAiEnabled()) {
    try {
      const { aiCategorise } = await import("@/lib/ai/categorise");
      return await aiCategorise(input);
    } catch {
      // fall through
    }
  }

  return heuristicCategorise(input.description, input.merchantName, input.amount);
}
