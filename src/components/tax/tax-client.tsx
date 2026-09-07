"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatGBP } from "@/lib/utils";
import { Download, Car, Home } from "lucide-react";

type Summary = {
  taxYear: { label: string };
  availableYears: string[];
  pendingReview: number;
  claimableCount: number;
  boxes: Array<{
    key: string;
    label: string;
    sa103Box: string;
    totalPence: number;
    count: number;
  }>;
  estimate: {
    turnover: number;
    allowableExpenses: number;
    capitalAllowances: number;
    mileageAllowance: number;
    wfhAllowance: number;
    netProfit: number;
    incomeTax: number;
    class4NI: number;
    class2NI: number;
    totalLiability: number;
    monthlyTaxPot: number;
    breakdown: { basicRateTax: number; higherRateTax: number; additionalRateTax: number };
  };
};

export function TaxClient() {
  const [data, setData] = useState<Summary | null>(null);
  const [taxYear, setTaxYear] = useState("");
  const [miles, setMiles] = useState("40");
  const [wfhHours, setWfhHours] = useState("80");
  const [wfhMonth, setWfhMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async (year?: string) => {
    const params = year ? `?taxYear=${year}` : "";
    const res = await fetch(`/api/tax${params}`);
    const json = await res.json();
    setData(json);
    setTaxYear(json.taxYear?.label ?? year ?? "");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addMileage() {
    await fetch("/api/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mileage", miles: Number(miles), taxYear, purpose: "Business travel" }),
    });
    load(taxYear);
  }

  async function addWfh() {
    await fetch("/api/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "wfh",
        hoursPerMonth: Number(wfhHours),
        month: wfhMonth,
        taxYear,
      }),
    });
    load(taxYear);
  }

  if (!data) return <div className="text-stone-500">Loading tax position…</div>;
  const e = data.estimate;

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-800 dark:text-teal-300">
            SA103 Tax Summary
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight">HMRC boxes & liability</h1>
          <p className="mt-2 text-stone-600 dark:text-stone-400">
            Estimated Income Tax and Class 4 NI for the selected UK tax year (6 Apr – 5 Apr).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={taxYear}
            onValueChange={(v) => {
              setTaxYear(v);
              load(v);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(data.availableYears ?? []).map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export?format=csv&taxYear=${taxYear}`}>
              <Download className="h-4 w-4" /> CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export?format=pdf&taxYear=${taxYear}`}>
              <Download className="h-4 w-4" /> PDF
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export?format=sa103&taxYear=${taxYear}`}>
              <Download className="h-4 w-4" /> SA103
            </a>
          </Button>
        </div>
      </header>

      <section className="animate-rise-delay-1 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Turnover", e.turnover],
          ["Allowable expenses", e.allowableExpenses],
          ["Net profit", e.netProfit],
          ["Total liability", e.totalLiability],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
              <div className="mt-2 font-serif text-2xl font-semibold">{formatGBP(value as number)}</div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="animate-rise-delay-2 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>SA103 category boxes</CardTitle>
            <CardDescription>Statutory HMRC allowable expense buckets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left dark:border-stone-800">
                    <th className="py-2 pr-4">Box</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Txns</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.boxes.map((b) => (
                    <tr key={b.key} className="border-b border-stone-100 dark:border-stone-900">
                      <td className="py-2.5 pr-4 text-stone-500">{b.sa103Box}</td>
                      <td className="py-2.5 pr-4">{b.label}</td>
                      <td className="py-2.5 pr-4">{b.count}</td>
                      <td className="py-2.5 text-right font-medium">{formatGBP(b.totalPence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Liability breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Basic rate tax" value={e.breakdown.basicRateTax} />
              <Row label="Higher rate tax" value={e.breakdown.higherRateTax} />
              <Row label="Additional rate tax" value={e.breakdown.additionalRateTax} />
              <Row label="Class 4 NI" value={e.class4NI} />
              <Row label="Class 2 NI (est.)" value={e.class2NI} />
              <Row label="Capital allowances" value={e.capitalAllowances} />
              <Row label="Mileage allowance" value={e.mileageAllowance} />
              <Row label="WFH simplified" value={e.wfhAllowance} />
              <div className="border-t border-stone-200 pt-3 dark:border-stone-800">
                <Row label="Monthly Tax Pot" value={e.monthlyTaxPot} bold />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Simplified expenses</CardTitle>
              <CardDescription>HMRC flat-rate mileage & WFH</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="justify-start">
                    <Car className="h-4 w-4" /> Log mileage
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Mileage log</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-stone-500">
                    45p/mile for first 10,000 business miles, then 25p/mile.
                  </p>
                  <div className="space-y-2">
                    <Label>Miles</Label>
                    <Input type="number" value={miles} onChange={(e) => setMiles(e.target.value)} />
                  </div>
                  <Button onClick={addMileage}>Add mileage</Button>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="justify-start">
                    <Home className="h-4 w-4" /> WFH hours
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Working from home</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-stone-500">
                    Flat rate: £10 (25–50h), £18 (51–100h), £26 (101h+) per month.
                  </p>
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Input type="month" value={wfhMonth} onChange={(e) => setWfhMonth(e.target.value)} />
                    <Label>Hours worked at home</Label>
                    <Input
                      type="number"
                      value={wfhHours}
                      onChange={(e) => setWfhHours(e.target.value)}
                    />
                  </div>
                  <Button onClick={addWfh}>Save WFH month</Button>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="text-stone-500">{label}</span>
      <span>{formatGBP(value)}</span>
    </div>
  );
}
