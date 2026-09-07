"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatGBP } from "@/lib/utils";
import { Upload, FileArchive } from "lucide-react";

type Receipt = {
  id: string;
  filename: string;
  mimeType: string;
  ocrTotal: number | null;
  ocrMerchant: string | null;
  ocrDate: string | null;
  ocrRaw: string | null;
  createdAt: string;
  transaction?: {
    id: string;
    description: string;
    merchantName: string | null;
    amount: number;
    hmrcCategory: string | null;
  } | null;
};

export function ReceiptsClient() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);

  async function load() {
    const res = await fetch("/api/receipts");
    const json = await res.json();
    setReceipts(json.receipts ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function upload(files: FileList | File[]) {
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      await fetch("/api/receipts", { method: "POST", body: form });
    }
    setUploading(false);
    load();
  }

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-800 dark:text-teal-300">
            Receipts & Audit
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight">Evidence locker</h1>
          <p className="mt-2 text-stone-600 dark:text-stone-400">
            Upload receipts for OCR matching, or export a month/category zip for HMRC records.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/api/export?format=receipts-zip">
            <FileArchive className="h-4 w-4" /> Export receipts zip
          </a>
        </Button>
      </header>

      <Card
        className={`animate-rise-delay-1 border-dashed transition-colors ${
          drag ? "border-teal-500 bg-teal-50/50 dark:bg-teal-950/30" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
        }}
      >
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Upload className="h-8 w-8 text-teal-700" />
          <div>
            <div className="font-medium">Drop receipt images or PDFs</div>
            <div className="text-sm text-stone-500">OCR extracts total, date, and merchant when OpenAI is configured</div>
          </div>
          <label>
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && upload(e.target.files)}
            />
            <Button asChild disabled={uploading}>
              <span>{uploading ? "Uploading…" : "Choose files"}</span>
            </Button>
          </label>
        </CardContent>
      </Card>

      <Card className="animate-rise-delay-2">
        <CardHeader>
          <CardTitle>Uploaded receipts</CardTitle>
          <CardDescription>{receipts.length} files in audit trail</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {receipts.length === 0 && (
            <p className="py-8 text-center text-sm text-stone-500">No receipts yet.</p>
          )}
          {receipts.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800"
            >
              <div>
                <div className="font-medium">{r.filename}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-stone-500">
                  {r.ocrMerchant && <Badge variant="outline">{r.ocrMerchant}</Badge>}
                  {r.ocrTotal != null && <Badge variant="secondary">£{r.ocrTotal.toFixed(2)}</Badge>}
                  {r.ocrDate && <span>{new Date(r.ocrDate).toLocaleDateString("en-GB")}</span>}
                </div>
                {r.transaction && (
                  <div className="mt-2 text-sm text-teal-800 dark:text-teal-300">
                    Matched: {r.transaction.merchantName ?? r.transaction.description} (
                    {formatGBP(r.transaction.amount)})
                  </div>
                )}
                {r.ocrRaw && (
                  <p className="mt-1 max-w-xl text-xs text-stone-500">{r.ocrRaw}</p>
                )}
              </div>
              <Badge>{r.mimeType}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
