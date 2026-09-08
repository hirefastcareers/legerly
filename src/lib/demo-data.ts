import { prisma } from "@/lib/db";
import { categoriseTransaction } from "@/lib/tax/rules-engine";
import { encryptToken } from "@/lib/encryption";

const DEMO_TXS: Array<{
  amount: number;
  description: string;
  merchantName: string;
  daysAgo: number;
  accountType: "personal" | "business";
}> = [
  { amount: 250000, description: "Invoice payment — Acme Ltd", merchantName: "Acme Ltd", daysAgo: 5, accountType: "business" },
  { amount: 180000, description: "Client retainer — Bright Studio", merchantName: "Bright Studio", daysAgo: 40, accountType: "business" },
  { amount: 95000, description: "Project milestone — Northwind", merchantName: "Northwind", daysAgo: 70, accountType: "business" },
  { amount: -4999, description: "Adobe Creative Cloud", merchantName: "Adobe", daysAgo: 3, accountType: "business" },
  { amount: -1820, description: "GitHub Pro", merchantName: "GitHub", daysAgo: 8, accountType: "business" },
  { amount: -3200, description: "AWS", merchantName: "AWS", daysAgo: 12, accountType: "business" },
  { amount: -4500, description: "Vercel Pro", merchantName: "Vercel", daysAgo: 15, accountType: "business" },
  { amount: -6200, description: "Trainline", merchantName: "Trainline", daysAgo: 6, accountType: "personal" },
  { amount: -2850, description: "TfL Travel", merchantName: "TfL", daysAgo: 2, accountType: "personal" },
  { amount: -350, description: "Costa Coffee", merchantName: "Costa", daysAgo: 1, accountType: "personal" },
  { amount: -4500, description: "EE Mobile", merchantName: "EE", daysAgo: 10, accountType: "personal" },
  { amount: -3800, description: "BT Broadband", merchantName: "BT", daysAgo: 18, accountType: "personal" },
  { amount: -129900, description: "Apple MacBook", merchantName: "Apple", daysAgo: 55, accountType: "business" },
  { amount: -8900, description: "LinkedIn Premium", merchantName: "LinkedIn", daysAgo: 25, accountType: "business" },
  { amount: -1500, description: "Companies House filing", merchantName: "Companies House", daysAgo: 90, accountType: "business" },
  { amount: -4500, description: "Monzo Pot — Tax", merchantName: "Monzo Pot", daysAgo: 4, accountType: "business" },
  { amount: -7200, description: "Uber trip", merchantName: "Uber", daysAgo: 9, accountType: "personal" },
  { amount: -12500, description: "Facebook Ads", merchantName: "Facebook Ads", daysAgo: 20, accountType: "business" },
  { amount: -899, description: "Netflix", merchantName: "Netflix", daysAgo: 7, accountType: "personal" },
  { amount: -5600, description: "Sainsbury's", merchantName: "Sainsbury's", daysAgo: 3, accountType: "personal" },
  { amount: -2400, description: "Notion AI", merchantName: "Notion", daysAgo: 28, accountType: "business" },
  { amount: -15000, description: "Accountancy fees", merchantName: "TaxAssist Accountants", daysAgo: 60, accountType: "business" },
];

export async function seedDemoTransactions(userId: string) {
  // Ensure demo accounts
  for (const type of ["personal", "business"] as const) {
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: "monzo",
          providerAccountId: `demo_${type}_${userId}`,
        },
      },
      update: {},
      create: {
        userId,
        provider: "monzo",
        providerAccountId: `demo_${type}_${userId}`,
        accountType: type,
        accountName: type === "business" ? "Monzo Business (Demo)" : "Monzo Personal (Demo)",
        encryptedAccessToken: "demo",
        encryptedRefreshToken: "demo",
      },
    });
  }

  const accounts = await prisma.account.findMany({ where: { userId } });
  const byType = Object.fromEntries(accounts.map((a) => [a.accountType, a]));

  // Seed system rules once
  const ruleCount = await prisma.rule.count({ where: { isSystem: true } });
  if (ruleCount === 0) {
    const { SYSTEM_RULES } = await import("@/lib/tax/hmrc-categories");
    await prisma.rule.createMany({
      data: SYSTEM_RULES.map((r) => ({
        merchantMatch: r.merchantMatch,
        matchType: r.matchType,
        hmrcCategory: r.hmrcCategory,
        businessPercent: r.businessPercent,
        isTaxClaimable: r.isTaxClaimable,
        isSystem: true,
        priority: r.priority,
        explanation: r.explanation,
      })),
    });
  }

  let imported = 0;
  for (const demo of DEMO_TXS) {
    const account = byType[demo.accountType];
    const monzoId = `demo_tx_${userId}_${demo.merchantName}_${demo.daysAgo}`;
    const exists = await prisma.transaction.findUnique({
      where: { monzoTransactionId: monzoId },
    });
    if (exists) continue;

    const cat = await categoriseTransaction({
      description: demo.description,
      merchantName: demo.merchantName,
      amount: demo.amount,
      useAi: false,
    });

    const created = new Date();
    created.setDate(created.getDate() - demo.daysAgo);

    await prisma.transaction.create({
      data: {
        userId,
        accountId: account?.id,
        monzoTransactionId: monzoId,
        amount: demo.amount,
        description: demo.description,
        merchantName: demo.merchantName,
        created,
        settled: created,
        isPotTransfer: Boolean(cat.isExcluded),
        isExcluded: Boolean(cat.isExcluded),
        source: "monzo",
        hmrcCategory: cat.hmrcCategory,
        businessPercent: cat.businessPercent,
        isTaxClaimable: cat.isTaxClaimable,
        aiConfidence: cat.confidence,
        aiExplanation: `[${cat.source}] ${cat.explanation}`,
        status: "pending",
        isIncome: demo.amount > 0,
      },
    });
    imported++;
  }

  return { imported, skipped: DEMO_TXS.length - imported, categorised: imported };
}

/** Ensure encryption helper is referenced so tree-shaking doesn't confuse demos */
export function _touchEncryption() {
  try {
    encryptToken("x");
  } catch {
    /* key may be set */
  }
}
