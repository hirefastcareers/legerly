import { PrismaClient } from "@prisma/client";
import { SYSTEM_RULES } from "../src/lib/tax/hmrc-categories";
import { seedDemoTransactions } from "../src/lib/demo-data";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "soletrader@example.com" },
    update: {},
    create: {
      email: "soletrader@example.com",
      name: "Demo Sole Trader",
    },
  });

  const ruleCount = await prisma.rule.count({ where: { isSystem: true } });
  if (ruleCount === 0) {
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

  const result = await seedDemoTransactions(user.id);
  console.log("Seeded user", user.email, result);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
