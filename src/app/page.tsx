import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isDemoMode } from "@/lib/session";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user || isDemoMode()) {
    redirect("/dashboard");
  }
  redirect("/login");
}
