import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";

/**
 * Session auth for the app. Monzo OAuth is handled separately
 * (multi-account personal + business) via /api/monzo/connect.
 * Demo mode auto-provisions a local user without passwords.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Demo",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email || "soletrader@example.com";
        const name = credentials?.name || "Demo Sole Trader";

        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({ data: { email, name } });
        }
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function getSessionUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getServerSessionFn: any,
  authOpts: NextAuthOptions
): Promise<string | null> {
  const session = await getServerSessionFn(authOpts);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}
