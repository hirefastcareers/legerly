"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, FileUp, Sparkles, User, X } from "lucide-react";

type Coverage = {
  total: number;
  pending: number;
  oldest: string | null;
  newest: string | null;
  byFeed: Record<
    string,
    { total: number; pending: number; oldest: string | null; newest: string | null }
  >;
  byTaxYear: Record<
    string,
    { total: number; pending: number; personal: number; business: number }
  >;
};

type FileResult = {
  fileName: string;
  accountType: "personal" | "business";
  imported: number;
  duplicates: number;
  sourceRows: number;
  skippedRows: number;
  warnings: string[];
  byTaxYear: Record<string, number>;
  error?: string;
};

type BatchResult = {
  ok?: boolean;
  partial?: boolean;
  message?: string;
  error?: string;
  totals?: { imported: number; duplicates: number; skippedRows: number; sourceRows: number };
  byTaxYear?: Record<string, number>;
  results?: FileResult[];
  coverage?: Coverage;
};

type Queued = { id: string; file: File; accountType: "personal" | "business" };

function DropZone({
  label,
  hint,
  icon,
  files,
  onAdd,
  onRemove,
  dragOver,
  setDragOver,
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  files: Queued[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed p-5 transition-colors ${
        dragOver
          ? "border-teal-600 bg-teal-50/80 dark:bg-teal-950/40"
          : "border-stone-300 dark:border-stone-700"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) onAdd(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center gap-2 font-medium">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-sm text-stone-500">{hint}</p>
      <label className="mt-3 inline-block">
        <input
          type="file"
          className="hidden"
          multiple
          accept=".csv,.tsv,.txt,application/pdf,image/*"
          onChange={(e) => e.target.files && onAdd(e.target.files)}
        />
        <Button asChild variant="outline" size="sm">
          <span>Add files</span>
        </Button>
      </label>
      {files.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-stone-100 px-2 py-1.5 dark:bg-stone-900"
            >
              <span className="truncate">{f.file.name}</span>
              <button type="button" aria-label="Remove" onClick={() => onRemove(f.id)}>
                <X className="h-4 w-4 text-stone-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StatementsClient() {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [dragPersonal, setDragPersonal] = useState(false);
  const [dragBusiness, setDragBusiness] = useState(false);

  const personal = queue.filter((q) => q.accountType === "personal");
  const business = queue.filter((q) => q.accountType === "business");

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/statements");
    const json = await res.json();
    setAiEnabled(Boolean(json.aiEnabled));
    if (json.aiEnabled) setUseAi(true);
    if (json.coverage) setCoverage(json.coverage);
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  function addFiles(accountType: "personal" | "business", list: FileList | File[]) {
    const incoming = Array.from(list).map((file) => ({
      id: `${accountType}-${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      accountType,
    }));
    setQueue((prev) => [...prev, ...incoming]);
  }

  function removeFile(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  async function importAll() {
    if (!queue.length) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set("useAi", useAi ? "true" : "false");
      for (const item of queue) {
        form.append(item.accountType === "business" ? "businessFiles" : "personalFiles", item.file);
      }
      const res = await fetch("/api/statements", { method: "POST", body: form });
      const json = (await res.json()) as BatchResult;
      if (!res.ok && !json.results) {
        setResult({ error: json.error ?? "Import failed" });
      } else {
        setResult(json);
        if (json.coverage) setCoverage(json.coverage);
        if (json.ok || json.partial) setQueue([]);
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setBusy(false);
    }
  }

  const taxYears = Object.keys(coverage?.byTaxYear ?? result?.byTaxYear ?? {}).sort().reverse();

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-800 dark:text-teal-300">
          Statement import
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">
          Personal + Business, every line
        </h1>
        <p className="mt-2 max-w-2xl text-stone-600 dark:text-stone-400">
          Drop all Monzo Personal CSVs in one zone and all Business CSVs in the other — including
          every month of <strong>2025-26</strong> and <strong>2026-27</strong>. Ledgerly merges both
          feeds, suggests HMRC categories, and you confirm each line on Transactions by tax year.
        </p>
      </header>

      <section className="animate-rise-delay-1 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" /> Upload both feeds
            </CardTitle>
            <CardDescription>
              Prefer Monzo CSV exports (Account → Statement → Download CSV). Multi-select is fine —
              nothing is filed until you review and confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <DropZone
                label="Personal Monzo"
                hint="All personal statement CSVs / PDFs for both tax years"
                icon={<User className="h-4 w-4" />}
                files={personal}
                onAdd={(f) => addFiles("personal", f)}
                onRemove={removeFile}
                dragOver={dragPersonal}
                setDragOver={setDragPersonal}
              />
              <DropZone
                label="Business Monzo"
                hint="All business statement CSVs / PDFs for both tax years"
                icon={<Building2 className="h-4 w-4" />}
                files={business}
                onAdd={(f) => addFiles("business", f)}
                onRemove={removeFile}
                dragOver={dragBusiness}
                setDragOver={setDragBusiness}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={useAi}
                  disabled={!aiEnabled}
                  onChange={(e) => setUseAi(e.target.checked)}
                />
                AI for PDF/photo + extra categorisation{" "}
                {!aiEnabled && <span className="text-stone-500">(ENABLE_AI off)</span>}
              </label>
              <Button onClick={importAll} disabled={busy || queue.length === 0}>
                {busy
                  ? "Importing…"
                  : `Import ${queue.length || ""} file${queue.length === 1 ? "" : "s"}`.trim()}
              </Button>
              {queue.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setQueue([])} disabled={busy}>
                  Clear queue
                </Button>
              )}
            </div>

            {result?.error && !result.results && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                {result.error}
              </div>
            )}

            {(result?.message || result?.results) && (
              <div
                className={`rounded-xl border p-4 text-sm ${
                  result.ok
                    ? "border-teal-300 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/40"
                    : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                }`}
              >
                <p className="font-medium">{result.message ?? result.error}</p>
                {result.totals && (
                  <p className="mt-1 text-stone-600 dark:text-stone-300">
                    Source lines: {result.totals.sourceRows} · New: {result.totals.imported} ·
                    Duplicates: {result.totals.duplicates} · Unparsed: {result.totals.skippedRows}
                  </p>
                )}
                {!!result.byTaxYear && Object.keys(result.byTaxYear).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(result.byTaxYear)
                      .sort(([a], [b]) => b.localeCompare(a))
                      .map(([year, n]) => (
                        <Badge key={year} variant="outline">
                          {year}: {n} new
                        </Badge>
                      ))}
                  </div>
                )}
                {result.results?.map((r) => (
                  <div
                    key={`${r.accountType}-${r.fileName}`}
                    className="mt-3 border-t border-stone-200/70 pt-2 dark:border-stone-700"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={r.accountType === "business" ? "success" : "outline"}>
                        {r.accountType}
                      </Badge>
                      <span className="font-medium">{r.fileName}</span>
                      {r.error && <span className="text-amber-800 dark:text-amber-200">{r.error}</span>}
                    </div>
                    <p className="text-xs text-stone-500">
                      {r.sourceRows} lines → {r.imported} imported, {r.duplicates} duplicate,{" "}
                      {r.skippedRows} unparsed
                    </p>
                    {r.warnings.slice(0, 8).map((w) => (
                      <p key={w} className="text-xs text-amber-900 dark:text-amber-100">
                        {w}
                      </p>
                    ))}
                  </div>
                ))}
                <div className="mt-4 flex flex-wrap gap-2">
                  {(taxYears.length ? taxYears : ["2025-26", "2026-27"]).map((year) => (
                    <Button key={year} asChild variant="secondary" size="sm">
                      <Link href={`/transactions?taxYear=${year}&status=needs_review`}>
                        Review {year}
                      </Link>
                    </Button>
                  ))}
                  <Button asChild variant="outline" size="sm">
                    <Link href="/transactions?taxYear=all&status=needs_review">
                      Review all years
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Combined coverage</CardTitle>
              <CardDescription>Personal + Business after imports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!coverage || coverage.total === 0 ? (
                <p className="text-stone-500">Nothing imported yet.</p>
              ) : (
                <>
                  <p>
                    <strong>{coverage.total}</strong> transactions ·{" "}
                    <strong>{coverage.pending}</strong> need confirm
                  </p>
                  <p className="text-xs text-stone-500">
                    {coverage.oldest && coverage.newest
                      ? `${new Date(coverage.oldest).toLocaleDateString("en-GB")} → ${new Date(
                          coverage.newest
                        ).toLocaleDateString("en-GB")}`
                      : null}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                      <div className="text-xs uppercase text-stone-500">Personal</div>
                      <div className="font-medium">{coverage.byFeed.personal?.total ?? 0}</div>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                      <div className="text-xs uppercase text-stone-500">Business</div>
                      <div className="font-medium">{coverage.byFeed.business?.total ?? 0}</div>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {Object.entries(coverage.byTaxYear)
                      .sort(([a], [b]) => b.localeCompare(a))
                      .map(([year, stats]) => (
                        <li key={year} className="flex items-center justify-between gap-2">
                          <Link
                            href={`/transactions?taxYear=${year}&status=needs_review`}
                            className="font-medium text-teal-800 underline dark:text-teal-300"
                          >
                            {year}
                          </Link>
                          <span className="text-xs text-stone-500">
                            {stats.total} · {stats.pending} left · P{stats.personal}/B
                            {stats.business}
                          </span>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" /> How review works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-stone-600 dark:text-stone-400">
              <p>1. Import both feeds (all months for both tax years).</p>
              <p>2. Open a tax year — categories are already suggested from rules.</p>
              <p>3. Press Confirm when the suggestion is right, or change category/split.</p>
              <p>4. Switch tax year anytime; Personal and Business stay tagged on each row.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
