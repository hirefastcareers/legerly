import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";

/** Remove seeded demo accounts + fake transactions so only live Monzo data remains. */
export async function POST() {
  try {
    const userId = await requireUserId();

    const demoAccounts = await prisma.account.findMany({
      where: {
        userId,
        OR: [
          { encryptedAccessToken: "demo" },
          { providerAccountId: { startsWith: "demo_" } },
        ],
      },
      select: { id: true },
    });
    const demoAccountIds = demoAccounts.map((a) => a.id);

    const deletedTx = await prisma.transaction.deleteMany({
      where: {
        userId,
        OR: [
          { monzoTransactionId: { startsWith: "demo_" } },
          ...(demoAccountIds.length ? [{ accountId: { in: demoAccountIds } }] : []),
        ],
      },
    });

    const deletedAccounts = await prisma.account.deleteMany({
      where: { id: { in: demoAccountIds } },
    });

    return NextResponse.json({
      ok: true,
      deletedTransactions: deletedTx.count,
      deletedAccounts: deletedAccounts.count,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}
