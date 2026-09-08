"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatGBP } from "@/lib/utils";
import { apiJson } from "@/lib/api-client";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  PiggyBank,
  RefreshCw,
  User,
  Wallet,
} from "lucide-react";

type DashboardData = {
  taxYear: string;
  pending: number;
  accounts: Array<{ id: string; accountType: string; accountName: string | null }>;
  recent: Array<{
    id: string;
    description: string;
    merchantName: string | null;
    amount: number;
    created: string;
    hmrcCategory: string | null;
    status: string;
    isTaxClaimable: boolean;
  }>;
  summary: {
    estimate: {
      turnover: number;
      allowableExpenses: number;
      netProfit: number;
      totalLiability: number;
      monthlyTaxPot: number;
      incomeTax: number;
      class4NI: number;
    };
    pendingReview: number;
  };
};

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [pending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      const json = await apiJson<DashboardData>("/api/dashboard");
      if (json?.summary?.estimate) setData(json);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setSyncing(true);
    setMessage(null);
    const res = await fetch("/api/monzo/sync", { method: "POST" });
    const json = await res.json();
    setSyncing(false);
    setMessage(
      json.demo
        ? `Loaded ${json.imported} demo transactions`
        : `Synced accounts (${JSON.stringify(json.results?.length ?? 0)} accounts)`
    );
    load();
  }

  if (!data?.summary?.estimate) {
    return <div className="animate-pulse text-stone-500">Loading workspace…</div>;
  }

  const est = data.summary.estimate;
  const hasPersonal = data.accounts.some((a) => a.accountType === "personal");
  const hasBusiness = data.accounts.some((a) => a.accountType === "business");

  return (
    <div className="space-y-8">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-800 dark:text-teal-300">
            Ledgerly
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Tax year {data.taxYear}
          </h1>
          <p className="mt-2 max-w-xl text-stone-600 dark:text-stone-400">
            Combined Monzo Personal & Business feeds with HMRC SA103 categorisation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={sync} disabled={syncing || pending}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync / seed demo"}
          </Button>
          <Button asChild variant="secondary">
            <Link href="/transactions">Review queue ({data.pending})</Link>
          </Button>
        </div>
      </header>

      {message && (
        <div className="animate-rise rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100">
          {message}
        </div>
      )}

      <section className="animate-rise-delay-1 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Turnover" value={formatGBP(est.turnover)} icon={<Wallet className="h-4 w-4" />} />
        <StatCard
          label="Allowable expenses"
          value={formatGBP(est.allowableExpenses)}
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
        <StatCard label="Net profit" value={formatGBP(est.netProfit)} icon={<Building2 className="h-4 w-4" />} />
        <StatCard
          label="Est. tax liability"
          value={formatGBP(est.totalLiability)}
          icon={<PiggyBank className="h-4 w-4" />}
          highlight
        />
      </section>

      <section className="animate-rise-delay-2 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monzo connections</CardTitle>
            <CardDescription>
              Connect both Personal and Business accounts. Tokens are encrypted with AES-256-GCM.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <ConnectCard
              title="Personal"
              connected={hasPersonal}
              href="/api/monzo/connect?type=personal"
              icon={<User className="h-5 w-5" />}
            />
            <ConnectCard
              title="Business"
              connected={hasBusiness}
              href="/api/monzo/connect?type=business"
              icon={<Building2 className="h-5 w-5" />}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax Pot suggestion</CardTitle>
            <CardDescription>Move this to your Monzo Tax Pot each month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-serif text-4xl font-semibold text-teal-800 dark:text-teal-300">
              {formatGBP(est.monthlyTaxPot)}
            </div>
            <p className="mt-3 text-sm text-stone-500">
              Income Tax {formatGBP(est.incomeTax)} · Class 4 NI {formatGBP(est.class4NI)}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-700"
                style={{
                  width: `${Math.min(100, est.netProfit > 0 ? (est.totalLiability / est.netProfit) * 100 : 0)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-stone-500">Effective rate of net profit</p>
          </CardContent>
        </Card>
      </section>

      <Card className="animate-rise-delay-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest imported transactions across accounts</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/transactions">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {data.recent.length === 0 && (
              <li className="py-8 text-center text-sm text-stone-500">
                No transactions yet. Click &ldquo;Sync / seed demo&rdquo; to load sample data.
              </li>
            )}
            {data.recent.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      tx.amount > 0
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                    }`}
                  >
                    {tx.amount > 0 ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{tx.merchantName ?? tx.description}</div>
                    <div className="text-xs text-stone-500">
                      {new Date(tx.created).toLocaleDateString("en-GB")} · {tx.hmrcCategory ?? "uncategorised"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-medium ${tx.amount > 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                    {formatGBP(tx.amount)}
                  </div>
                  <Badge variant={tx.status === "confirmed" ? "success" : "warning"} className="mt-1">
                    {tx.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-teal-300 dark:border-teal-800" : undefined}>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between text-stone-500">
          <span className="text-xs uppercase tracking-wider">{label}</span>
          {icon}
        </div>
        <div className="font-serif text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function ConnectCard({
  title,
  connected,
  href,
  icon,
}: {
  title: string;
  connected: boolean;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="font-medium">Monzo {title}</span>
        <Badge variant={connected ? "success" : "outline"} className="ml-auto">
          {connected ? "Connected" : "Not linked"}
        </Badge>
      </div>
      <Button asChild size="sm" variant={connected ? "secondary" : "default"} className="w-full">
        <a href={href}>{connected ? "Reconnect" : `Connect ${title}`}</a>
      </Button>
    </div>
  );
}
