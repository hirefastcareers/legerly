"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatGBP } from "@/lib/utils";
import { apiJson } from "@/lib/api-client";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  PiggyBank,
  RefreshCw,
  Smartphone,
  Trash2,
  User,
  Wallet,
} from "lucide-react";

type DashboardData = {
  taxYear: string;
  pending: number;
  accounts: Array<{
    id: string;
    accountType: string;
    accountName: string | null;
    isLive?: boolean;
    isDemo?: boolean;
  }>;
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
  status?: {
    monzoConfigured: boolean;
    demoMode: boolean;
    aiEnabled: boolean;
    liveAccountCount: number;
    demoAccountCount: number;
    demoTransactionCount: number;
    monzoUserCount?: number;
    awaitingApproval?: boolean;
  };
};

export function DashboardClient() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<DashboardData | null>(null);
  const [pending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [approvalReady, setApprovalReady] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAwaiting, setShowAwaiting] = useState(false);

  const load = useCallback(() => {
    startTransition(async () => {
      const json = await apiJson<DashboardData>("/api/dashboard");
      if (json?.summary?.estimate) {
        setData(json);
        if (json.status?.awaitingApproval) setShowAwaiting(true);
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "monzo_not_configured") {
      setError(
        "Monzo credentials are missing on Vercel. Add MONZO_CLIENT_ID and MONZO_CLIENT_SECRET, then reconnect."
      );
    } else if (err === "oauth_failed") {
      setError("Monzo login failed. Check redirect URI matches exactly, then try Connect again.");
    } else if (searchParams.get("awaiting_approval") === "1") {
      setShowAwaiting(true);
      setMessage(
        "Email login worked. Now open the Monzo app and approve access — then click Import full history here."
      );
    }
  }, [searchParams]);

  // Poll Monzo approval status while waiting
  useEffect(() => {
    if (!showAwaiting) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/monzo/import");
        const json = await res.json();
        if (cancelled) return;
        if (!json.awaiting) {
          setShowAwaiting(false);
          load();
          return;
        }
        setApprovalReady(Boolean(json.ready));
        setApprovalMessage(json.message ?? null);
      } catch {
        /* ignore transient poll errors */
      }
    }

    tick();
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [showAwaiting, load]);

  async function importHistory() {
    setImporting(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/monzo/import", { method: "POST" });
    const json = await res.json();
    setImporting(false);
    if (!res.ok || json.ok === false) {
      setError(json.error || "Import failed");
      if (json.hint) setMessage(json.hint);
      setShowAwaiting(true);
      return;
    }
    setShowAwaiting(false);
    setMessage(
      json.message ||
        `Imported full history for ${json.synced} account(s). Later Syncs only pull new activity.`
    );
    load();
  }

  async function sync() {
    setSyncing(true);
    setMessage(null);
    setError(null);
    const res = await fetch("/api/monzo/sync", { method: "POST" });
    const json = await res.json();
    setSyncing(false);
    if (!res.ok || json.ok === false) {
      setError(json.error || json.hint || "Sync failed");
      if (json.hint && json.error) setMessage(json.hint);
      return;
    }
    if (json.demo) {
      setMessage(`Loaded ${json.imported} demo transactions (DEMO_MODE is on)`);
    } else {
      const imported = (json.results ?? []).reduce(
        (sum: number, r: { imported?: number }) => sum + (r.imported ?? 0),
        0
      );
      const errs = (json.results ?? []).filter((r: { error?: string }) => r.error);
      setMessage(
        errs.length
          ? json.hint || "Sync finished with errors — see details below."
          : `Synced from Monzo — ${imported} new transactions (recent activity only).`
      );
      if (errs.length) {
        setError(
          errs
            .map((e: { accountType?: string; error: string }) =>
              `${e.accountType ?? "account"}: ${e.error}`
            )
            .join(" · ")
        );
      }
    }
    load();
  }

  async function clearDemo() {
    setClearing(true);
    setError(null);
    const res = await fetch("/api/monzo/clear-demo", { method: "POST" });
    const json = await res.json();
    setClearing(false);
    setMessage(
      `Removed ${json.deletedTransactions ?? 0} demo transactions and ${json.deletedAccounts ?? 0} demo accounts.`
    );
    load();
  }

  if (!data?.summary?.estimate) {
    return <div className="animate-pulse text-stone-500">Loading workspace…</div>;
  }

  const est = data.summary.estimate;
  const status = data.status;
  const liveAccounts = (data.accounts ?? []).filter(
    (a) => (a as { isLive?: boolean }).isLive !== false && !(a as { isDemo?: boolean }).isDemo
  );
  const hasAnyLive = (status?.liveAccountCount ?? 0) > 0 || liveAccounts.length > 0;
  const hasDemoData =
    (status?.demoAccountCount ?? 0) > 0 || (status?.demoTransactionCount ?? 0) > 0;
  const personalFeeds = liveAccounts.filter((a) => a.accountType === "personal");
  const businessFeeds = liveAccounts.filter((a) => a.accountType === "business");

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
            Combined Monzo Personal & Business feeds with HMRC SA103 categorisation. Filing last
            year? Open{" "}
            <Link href="/tax?taxYear=2025-26" className="font-medium text-teal-800 underline dark:text-teal-300">
              2025-26 tax summary
            </Link>{" "}
            (6 Apr 2025 – 5 Apr 2026).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasDemoData && (
            <Button variant="outline" onClick={clearDemo} disabled={clearing}>
              <Trash2 className="h-4 w-4" />
              {clearing ? "Clearing…" : "Clear demo data"}
            </Button>
          )}
          <Button variant="outline" onClick={sync} disabled={syncing || pending}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync from Monzo"}
          </Button>
          <Button asChild variant="secondary">
            <Link href="/transactions">Review queue ({data.pending})</Link>
          </Button>
        </div>
      </header>

      {status && (
        <div className="animate-rise flex flex-wrap gap-2 text-xs">
          <Badge variant={status.monzoConfigured ? "success" : "warning"}>
            Monzo API {status.monzoConfigured ? "configured" : "not configured"}
          </Badge>
          <Badge variant={status.liveAccountCount > 0 ? "success" : "outline"}>
            {status.liveAccountCount} live account{status.liveAccountCount === 1 ? "" : "s"}
          </Badge>
          {hasDemoData && (
            <Badge variant="warning">
              {status.demoTransactionCount} demo transactions still loaded
            </Badge>
          )}
          <Badge variant={status.aiEnabled ? "default" : "secondary"}>
            AI {status.aiEnabled ? "on" : "off (free)"}
          </Badge>
          {status.demoMode && <Badge variant="warning">DEMO_MODE=true</Badge>}
        </div>
      )}

      {error && (
        <div className="animate-rise rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {error}
        </div>
      )}

      {message && (
        <div className="animate-rise rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100">
          {message}
        </div>
      )}

      {(showAwaiting || status?.awaitingApproval) && (
        <Card className="animate-rise border-teal-300 dark:border-teal-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-teal-700" />
              Approve in the Monzo app
            </CardTitle>
            <CardDescription>
              The website redirect finishes before Monzo grants permission. Open the Monzo app,
              approve the access request (push notification / Manage apps), then import here.
              Full tax-year history only works in this short window after approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-600 dark:text-stone-300">
              <li>Open the Monzo app on your phone</li>
              <li>Approve Ledgerly / your OAuth client when prompted</li>
              <li>Come back here and click Import full history</li>
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={approvalReady ? "success" : "warning"}>
                {approvalReady ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Approved — ready to import
                  </span>
                ) : (
                  "Waiting for app approval…"
                )}
              </Badge>
              {approvalMessage && (
                <span className="text-xs text-stone-500">{approvalMessage}</span>
              )}
            </div>
            <Button onClick={importHistory} disabled={importing}>
              <RefreshCw className={`h-4 w-4 ${importing ? "animate-spin" : ""}`} />
              {importing ? "Importing full history…" : "I've approved — import full history"}
            </Button>
          </CardContent>
        </Card>
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
              Monzo only allows <strong>one active token per login</strong>. Connect once, then
              approve in the Monzo app (after the browser redirect). Click{" "}
              <strong>Import full history</strong> only after that approval — that&apos;s how we
              capture your tax year. Later Syncs only pull new activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href="/api/monzo/connect">
                  {hasAnyLive ? "Reconnect Monzo" : "Connect Monzo"}
                </a>
              </Button>
              <Button
                onClick={importHistory}
                disabled={importing || (!hasAnyLive && !showAwaiting && !status?.awaitingApproval)}
                variant="secondary"
              >
                <RefreshCw className={`h-4 w-4 ${importing ? "animate-spin" : ""}`} />
                {importing ? "Importing…" : "Import full history"}
              </Button>
              {hasAnyLive && (
                <Button asChild variant="outline">
                  <a href="/api/monzo/connect?type=business">Connect another Monzo login</a>
                </Button>
              )}
            </div>
            <p className="text-xs text-stone-500">
              Use <strong>Import full history</strong> after approving in the Monzo app (tax year
              data). Monzo only allows a long backfill for a few minutes after approval, and each API
              request can cover at most ~1 year — Ledgerly chunks that automatically. Use{" "}
              <strong>Sync from Monzo</strong> afterwards for new transactions only (~90 days).
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                <div className="mb-2 flex items-center gap-2">
                  <User className="h-5 w-5" />
                  <span className="font-medium">Personal feeds</span>
                  <Badge variant={personalFeeds.length ? "success" : "outline"} className="ml-auto">
                    {personalFeeds.length || "None"}
                  </Badge>
                </div>
                <ul className="space-y-1 text-sm text-stone-500">
                  {personalFeeds.length === 0 && <li>Not linked yet</li>}
                  {personalFeeds.map((a) => (
                    <li key={a.id}>{a.accountName ?? a.id}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                <div className="mb-2 flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  <span className="font-medium">Business feeds</span>
                  <Badge variant={businessFeeds.length ? "success" : "outline"} className="ml-auto">
                    {businessFeeds.length || "None"}
                  </Badge>
                </div>
                <ul className="space-y-1 text-sm text-stone-500">
                  {businessFeeds.length === 0 && (
                    <li>Appears after connect if Monzo returns a business account</li>
                  )}
                  {businessFeeds.map((a) => (
                    <li key={a.id}>{a.accountName ?? a.id}</li>
                  ))}
                </ul>
              </div>
            </div>
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
                No live transactions yet. Connect Monzo, approve in the app, then Sync from Monzo.
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

