"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { HMRC_CATEGORY_LIST } from "@/lib/tax/hmrc-categories";
import { formatGBP } from "@/lib/utils";
import { apiJson } from "@/lib/api-client";
import { Check, RotateCcw, Sparkles, Split } from "lucide-react";

type Tx = {
  id: string;
  description: string;
  merchantName: string | null;
  amount: number;
  created: string;
  hmrcCategory: string | null;
  businessPercent: number;
  isTaxClaimable: boolean;
  status: string;
  aiExplanation: string | null;
  aiConfidence: number | null;
  isExcluded: boolean;
  account?: { accountType: string; accountName: string | null } | null;
};

type ListResponse = {
  transactions?: Tx[];
  availableYears?: string[];
  yearOptions?: Array<{ value: string; label: string; range: string }>;
  taxYear?: string;
  counts?: {
    shown: number;
    totalImported: number;
    pending: number;
    currentTaxYear: string;
  };
};

export function TransactionsClient() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("all");
  const [accountType, setAccountType] = useState("all");
  const [taxYear, setTaxYear] = useState("all");
  const [yearOptions, setYearOptions] = useState<
    Array<{ value: string; label: string; range: string }>
  >([{ value: "all", label: "All imported", range: "Every transaction stored in Ledgerly" }]);
  const [counts, setCounts] = useState<ListResponse["counts"]>();
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const [splitId, setSplitId] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState("70");

  const load = useCallback(() => {
    startTransition(async () => {
      const params = new URLSearchParams({ status, accountType, q, taxYear });
      const json = await apiJson<ListResponse>(`/api/transactions?${params}`);
      setTransactions(json?.transactions ?? []);
      if (json?.yearOptions?.length) setYearOptions(json.yearOptions);
      else if (json?.availableYears?.length) {
        setYearOptions(
          json.availableYears.map((y) => ({
            value: y,
            label: y === "all" ? "All imported" : y,
            range: "",
          }))
        );
      }
      if (json?.counts) setCounts(json.counts);
    });
  }, [status, accountType, q, taxYear]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === transactions.length) setSelected(new Set());
    else setSelected(new Set(transactions.map((t) => t.id)));
  }

  async function patch(ids: string[], body: Record<string, unknown>) {
    setTransactions((prev) =>
      prev.map((t) => (ids.includes(t.id) ? ({ ...t, ...body } as Tx) : t))
    );
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ...body }),
    });
    load();
  }

  async function confirmSelected() {
    await patch(Array.from(selected), { confirm: true, status: "confirmed" });
    setSelected(new Set());
  }

  async function bulkCategory(hmrcCategory: string) {
    await patch(Array.from(selected), {
      hmrcCategory,
      isTaxClaimable: hmrcCategory !== "non_deductible" && hmrcCategory !== "income",
      status: "overridden",
    });
    setSelected(new Set());
  }

  async function bulkClaimable(isTaxClaimable: boolean) {
    await patch(Array.from(selected), { isTaxClaimable, status: "overridden" });
    setSelected(new Set());
  }

  async function runRules() {
    const ids = selected.size ? Array.from(selected) : [];
    await fetch("/api/categorise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, useAi: false }),
    });
    load();
  }

  async function sendAllToReview() {
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_all_to_review" }),
    });
    setStatus("needs_review");
    load();
  }

  async function applySplit() {
    if (!splitId) return;
    await patch([splitId], {
      businessPercent: Number(splitPercent),
      isTaxClaimable: Number(splitPercent) > 0,
      status: "overridden",
    });
    setSplitId(null);
  }

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-800 dark:text-teal-300">
          Transactions Engine
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">Categorisation workspace</h1>
        <p className="mt-2 max-w-2xl text-stone-600 dark:text-stone-400">
          Check every Monzo payment here. <strong>Confirm</strong> accepts the suggested category.
          Changing the category (or split) also marks it reviewed — you don&apos;t need Confirm after
          that. Use tax year <strong>All imported</strong> to see history outside the current year.
        </p>
      </header>

      <Card className="animate-rise-delay-1">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-44">
            <Label className="mb-1 block text-xs">Review status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="needs_review">Needs review</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="pending">Pending only</SelectItem>
                <SelectItem value="confirmed">Confirmed only</SelectItem>
                <SelectItem value="overridden">Overridden only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="mb-1 block text-xs">Tax year</Label>
            <Select value={taxYear} onValueChange={setTaxYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y.value} value={y.value} description={y.range || undefined}>
                    {y.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="mb-1 block text-xs">Account</Label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All feeds</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="business">Business</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px] flex-1">
            <Label className="mb-1 block text-xs">Search</Label>
            <Input
              placeholder="Merchant or description…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={runRules}>
            <Sparkles className="h-4 w-4" />
            Re-run rules
          </Button>
          <Button variant="secondary" onClick={sendAllToReview}>
            <RotateCcw className="h-4 w-4" />
            Check every transaction
          </Button>
        </CardContent>
      </Card>

      {counts && (
        <p className="text-xs text-stone-500">
          Showing <strong>{counts.shown}</strong> of <strong>{counts.totalImported}</strong> imported
          · <strong>{counts.pending}</strong> still need review
          {taxYear !== "all" ? ` · filtered to tax year ${taxYear}` : " · all years"}
          {taxYear !== "all" && counts.totalImported > counts.shown
            ? " — switch Tax year to “All imported” to see the rest"
            : ""}
        </p>
      )}

      {selected.size > 0 && (
        <div className="animate-rise sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/95 p-3 shadow-sm backdrop-blur dark:border-teal-900 dark:bg-teal-950/90">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" onClick={confirmSelected}>
            <Check className="h-3 w-3" /> Confirm suggestions
          </Button>
          <Button size="sm" variant="secondary" onClick={() => bulkClaimable(true)}>
            Mark tax claimable
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => patch(Array.from(selected), { status: "pending" })}
          >
            Send back to review
          </Button>
          <Select onValueChange={bulkCategory}>
            <SelectTrigger className="h-8 w-52">
              <SelectValue placeholder="Set HMRC category" />
            </SelectTrigger>
            <SelectContent className="w-72">
              {HMRC_CATEGORY_LIST.map((c) => (
                <SelectItem key={c.key} value={c.key} description={c.description}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Card className="animate-rise-delay-2">
        <CardHeader>
          <CardTitle className="text-base">
            {pending ? "Updating…" : `${transactions.length} transactions`}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left dark:border-stone-800 dark:bg-stone-900">
              <tr>
                <th className="px-4 py-3">
                  <Checkbox
                    checked={selected.size === transactions.length && transactions.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Merchant</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Split</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-900">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className={`transition-colors ${selected.has(tx.id) ? "bg-teal-50/50 dark:bg-teal-950/30" : "hover:bg-stone-50 dark:hover:bg-stone-900/50"}`}
                >
                  <td className="px-4 py-3">
                    <Checkbox checked={selected.has(tx.id)} onCheckedChange={() => toggle(tx.id)} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-500">
                    {new Date(tx.created).toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{tx.merchantName ?? tx.description}</div>
                    <div className="max-w-xs truncate text-xs text-stone-500">
                      {tx.aiExplanation}
                    </div>
                    <div className="mt-1 flex gap-1">
                      <Badge variant="outline">{tx.account?.accountType ?? "—"}</Badge>
                      {tx.isExcluded && <Badge variant="warning">Excluded</Badge>}
                    </div>
                  </td>
                  <td className={`px-4 py-3 font-medium ${tx.amount > 0 ? "text-emerald-700" : ""}`}>
                    {formatGBP(tx.amount)}
                  </td>
                  <td className="w-48 max-w-[12rem] px-4 py-3">
                    <Select
                      value={tx.hmrcCategory ?? "non_deductible"}
                      onValueChange={(v) =>
                        patch([tx.id], {
                          hmrcCategory: v,
                          isTaxClaimable: v !== "non_deductible" && v !== "income",
                          status: "overridden",
                        })
                      }
                    >
                      <SelectTrigger
                        className="h-9 w-full min-w-0"
                        title={
                          HMRC_CATEGORY_LIST.find(
                            (c) => c.key === (tx.hmrcCategory ?? "non_deductible")
                          )?.description
                        }
                      >
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent className="w-80">
                        {HMRC_CATEGORY_LIST.map((c) => (
                          <SelectItem key={c.key} value={c.key} description={c.description}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">{tx.businessPercent}%</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        tx.status === "confirmed"
                          ? "success"
                          : tx.status === "overridden"
                            ? "default"
                            : "warning"
                      }
                    >
                      {tx.status === "overridden"
                        ? "reviewed"
                        : tx.status === "confirmed"
                          ? "confirmed"
                          : "needs review"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {tx.status === "pending" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => patch([tx.id], { confirm: true, status: "confirmed" })}
                        >
                          Confirm
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => patch([tx.id], { status: "pending" })}
                        >
                          Re-check
                        </Button>
                      )}
                      <Dialog
                        open={splitId === tx.id}
                        onOpenChange={(o) => {
                          setSplitId(o ? tx.id : null);
                          if (o) setSplitPercent(String(tx.businessPercent ?? 70));
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" title="Split business %">
                            <Split className="h-3 w-3" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Split expense — business %</DialogTitle>
                          </DialogHeader>
                          <p className="text-sm text-stone-500">
                            {tx.merchantName ?? tx.description} · {formatGBP(tx.amount)}
                          </p>
                          <div className="space-y-2">
                            <Label>Business percentage</Label>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={splitPercent}
                              onChange={(e) => setSplitPercent(e.target.value)}
                            />
                            <p className="text-xs text-stone-500">
                              Claimable:{" "}
                              {formatGBP(
                                Math.round((Math.abs(tx.amount) * Number(splitPercent || 0)) / 100)
                              )}
                            </p>
                          </div>
                          <Button onClick={applySplit}>Save split</Button>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-stone-500">
              No transactions in this view. Try Tax year → All imported, or Review status → All.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
