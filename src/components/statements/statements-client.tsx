"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUp, Sparkles, FileSpreadsheet } from "lucide-react";

type Meta = { aiEnabled?: boolean; tip?: string };
type ImportResult = {
  ok?: boolean;
  imported?: number;
  duplicates?: number;
  format?: string;
  warnings?: string[];
  oldest?: string;
  newest?: string;
  message?: string;
  error?: string;
  aiEnabled?: boolean;
};

export function StatementsClient() {
  const [meta, setMeta] = useState<Meta>({});
  const [accountType, setAccountType] = useState<"personal" | "business">("personal");
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/statements");
    const json = (await res.json()) as Meta;
    setMeta(json);
    if (json.aiEnabled) setUseAi(true);
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  async function upload(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("accountType", accountType);
      form.set("useAi", useAi ? "true" : "false");
      const res = await fetch("/api/statements", { method: "POST", body: form });
      const json = (await res.json()) as ImportResult;
      if (!res.ok) {
        setResult({ error: json.error ?? "Import failed", aiEnabled: json.aiEnabled });
      } else {
        setResult(json);
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-800 dark:text-teal-300">
          Statement import
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">Skip the Monzo SCA window</h1>
        <p className="mt-2 max-w-2xl text-stone-600 dark:text-stone-400">
          Upload a bank statement and Ledgerly will turn the lines into reviewable transactions —
          useful for tax year 2025-26 when live Monzo history is capped. CSV is free and accurate;
          PDF/photo scanning uses AI when enabled.
        </p>
      </header>

      <section className="animate-rise-delay-1 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upload statement</CardTitle>
            <CardDescription>{meta.tip}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="w-44">
                <Label className="mb-1 block text-xs">Treat as</Label>
                <Select
                  value={accountType}
                  onValueChange={(v) => setAccountType(v as "personal" | "business")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal feed</SelectItem>
                    <SelectItem value="business">Business feed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <input
                  id="use-ai"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={useAi}
                  disabled={!meta.aiEnabled}
                  onChange={(e) => setUseAi(e.target.checked)}
                />
                <Label htmlFor="use-ai" className="text-sm">
                  Use AI for PDF/photo + categorisation{" "}
                  {!meta.aiEnabled && (
                    <span className="text-stone-500">(ENABLE_AI off)</span>
                  )}
                </Label>
              </div>
            </div>

            <div
              className={`rounded-2xl border border-dashed p-10 text-center transition-colors ${
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
                const f = e.dataTransfer.files?.[0];
                if (f) upload(f);
              }}
            >
              <FileUp className="mx-auto h-8 w-8 text-teal-800 dark:text-teal-300" />
              <div className="mt-3 font-medium">Drop Monzo CSV, PDF, or statement photo</div>
              <p className="mt-1 text-sm text-stone-500">
                Monzo: Account → Statement → Download CSV (covers any tax year you can export)
              </p>
              <label className="mt-4 inline-block">
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.tsv,.txt,application/pdf,image/*"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
                <Button asChild disabled={busy}>
                  <span>{busy ? "Importing…" : "Choose file"}</span>
                </Button>
              </label>
            </div>

            {result?.error && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                {result.error}
              </div>
            )}
            {result?.ok && (
              <div className="rounded-xl border border-teal-300 bg-teal-50 p-4 text-sm text-teal-950 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100">
                <p className="font-medium">{result.message}</p>
                <p className="mt-1 text-teal-900/80 dark:text-teal-100/80">
                  Format: {result.format}
                  {result.oldest && result.newest
                    ? ` · ${new Date(result.oldest).toLocaleDateString("en-GB")} → ${new Date(
                        result.newest
                      ).toLocaleDateString("en-GB")}`
                    : ""}
                </p>
                {!!result.warnings?.length && (
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                <Button asChild variant="secondary" className="mt-3" size="sm">
                  <Link href="/transactions?taxYear=all">Review imported transactions</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4" /> Free CSV path
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-stone-600 dark:text-stone-400">
              <p>1. Open Monzo → pick Personal or Business</p>
              <p>2. Statement → choose months covering 2025-26</p>
              <p>3. Download CSV → upload here</p>
              <p>No OpenAI cost. Dedupes against live Monzo sync if the same tx id appears.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" /> AI scan path
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-stone-600 dark:text-stone-400">
              <p>PDF statements or phone photos of paper statements.</p>
              <p>
                Needs <code className="text-xs">ENABLE_AI=true</code> and an OpenAI key on Vercel.
                Always review the extracted lines before filing.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
