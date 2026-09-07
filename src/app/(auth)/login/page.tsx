"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("soletrader@example.com");
  const [name, setName] = useState("Demo Sole Trader");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("credentials", {
      email,
      name,
      callbackUrl: "/dashboard",
    });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-teal-100 via-stone-100 to-amber-100 px-4 dark:from-stone-950 dark:via-stone-900 dark:to-teal-950">
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgMzBoNjBNMzAgMHY2MCIgc3Ryb2tlPSJyZ2JhKDAsMCwwLDAuMDQpIiBmaWxsPSJub25lIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2cpIi8+PC9zdmc+')] opacity-60" />

      <div className="relative z-10 w-full max-w-md animate-rise rounded-2xl border border-stone-200/80 bg-white/90 p-8 shadow-xl backdrop-blur dark:border-stone-800 dark:bg-stone-950/80">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">Ledgerly</h1>
            <p className="text-sm text-stone-500">Self Assessment from your Monzo feeds</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Continue to workspace"}
          </Button>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-stone-500">
          Demo mode provisions a local workspace. Connect real Monzo Personal and Business
          accounts from the dashboard once you add OAuth credentials.
        </p>
      </div>
    </div>
  );
}
