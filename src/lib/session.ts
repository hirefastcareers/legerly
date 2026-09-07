import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function requireUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (id) return id;

  // Demo fallback for local development without forcing login on every API call
  if (process.env.DEMO_MODE === "true") {
    const demo = await prisma.user.upsert({
      where: { email: "soletrader@example.com" },
      update: {},
      create: { email: "soletrader@example.com", name: "Demo Sole Trader" },
    });
    return demo.id;
  }

  throw new Error("UNAUTHORIZED");
}
