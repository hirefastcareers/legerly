"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HMRC_CATEGORY_LIST } from "@/lib/tax/hmrc-categories";
import { CategoryReferenceList } from "@/components/tax/category-reference";

type Rule = {
  id: string;
  merchantMatch: string;
  matchType: string;
  hmrcCategory: string;
  businessPercent: number;
  isTaxClaimable: boolean;
  isSystem: boolean;
  priority: number;
  explanation: string | null;
};

export function RulesClient() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [merchantMatch, setMerchantMatch] = useState("");
  const [hmrcCategory, setHmrcCategory] = useState("office_costs");
  const [businessPercent, setBusinessPercent] = useState("100");
  const [explanation, setExplanation] = useState("");

  async function load() {
    const res = await fetch("/api/rules");
    const json = await res.json();
    setRules(json.rules ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantMatch,
        hmrcCategory,
        businessPercent: Number(businessPercent),
        explanation,
        isTaxClaimable: hmrcCategory !== "non_deductible",
      }),
    });
    setMerchantMatch("");
    setExplanation("");
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/rules?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-800 dark:text-teal-300">
          Rules & Categories
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">Merchant matching</h1>
        <p className="mt-2 max-w-2xl text-stone-600 dark:text-stone-400">
          System HMRC rules are locked. Built-in gardener rules cover plants, materials, fuel,
          machinery, insurance and trade directories. Add custom merchants for your local suppliers.
        </p>
      </header>

      <Card className="animate-rise border-teal-200 dark:border-teal-900">
        <CardHeader>
          <CardTitle className="text-base">Self-employed gardener cheat sheet</CardTitle>
          <CardDescription>How common garden-care spend maps to SA103 boxes</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="font-medium">Cost of goods (Box 15)</div>
            <p className="text-stone-500">Plants, compost, turf, bark, fencing, skips, B&amp;Q / Travis Perkins materials used on client jobs</p>
          </div>
          <div>
            <div className="font-medium">Travel &amp; vehicle (Box 20/21)</div>
            <p className="text-stone-500">Fuel, parking, van hire, commercial van insurance, MOT — or log mileage at 45p</p>
          </div>
          <div>
            <div className="font-medium">Capital allowances (AIA)</div>
            <p className="text-stone-500">Mowers, strimmers, Stihl/Husqvarna kit, trailers, major power tools</p>
          </div>
          <div>
            <div className="font-medium">Maintenance</div>
            <p className="text-stone-500">Blade sharpening, tool repairs, servicing existing equipment</p>
          </div>
          <div>
            <div className="font-medium">Advertising</div>
            <p className="text-stone-500">Checkatrade, Rated People, MyBuilder, Bark, leaflets, Vistaprint</p>
          </div>
          <div>
            <div className="font-medium">Professional fees</div>
            <p className="text-stone-500">Public liability insurance, Simply Business, accountancy</p>
          </div>
        </CardContent>
      </Card>

      <div className="animate-rise-delay-1 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>New rule</CardTitle>
            <CardDescription>Exact / contains match on merchant or description</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createRule} className="space-y-3">
              <div className="space-y-1">
                <Label>Merchant contains</Label>
                <Input
                  value={merchantMatch}
                  onChange={(e) => setMerchantMatch(e.target.value)}
                  required
                  placeholder="e.g. Figma"
                />
              </div>
              <div className="space-y-1">
                <Label>HMRC category</Label>
                <Select value={hmrcCategory} onValueChange={setHmrcCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HMRC_CATEGORY_LIST.map((c) => (
                      <SelectItem key={c.key} value={c.key} textValue={c.label}>
                        <div className="flex flex-col gap-0.5 py-0.5">
                          <span>{c.label}</span>
                          <span className="max-w-xs text-xs font-normal text-stone-500">
                            {c.sa103Box} · {c.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-stone-500">
                  {HMRC_CATEGORY_LIST.find((c) => c.key === hmrcCategory)?.description}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Business %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={businessPercent}
                  onChange={(e) => setBusinessPercent(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Explanation</Label>
                <Input
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Why this is allowable"
                />
              </div>
              <Button type="submit" className="w-full">
                Add rule
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Active rules ({rules.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{rule.merchantMatch}</span>
                    <Badge variant={rule.isSystem ? "secondary" : "default"}>
                      {rule.isSystem ? "System" : "Custom"}
                    </Badge>
                    <Badge variant="outline">{rule.businessPercent}%</Badge>
                  </div>
                  <div className="mt-1 text-sm text-stone-500">
                    {HMRC_CATEGORY_LIST.find((c) => c.key === rule.hmrcCategory)?.label ??
                      rule.hmrcCategory}{" "}
                    · {rule.explanation}
                  </div>
                </div>
                {!rule.isSystem && (
                  <Button size="sm" variant="ghost" onClick={() => remove(rule.id)}>
                    Delete
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="animate-rise-delay-2">
        <CardHeader>
          <CardTitle>Statutory HMRC boxes</CardTitle>
          <CardDescription>
            Refer to these descriptions when tagging transactions. Boxes cannot be renamed or removed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryReferenceList />
        </CardContent>
      </Card>
    </div>
  );
}
