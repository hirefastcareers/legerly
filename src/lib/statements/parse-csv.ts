import { createHash } from "crypto";
import type { ParsedStatementRow, StatementParseResult } from "@/lib/statements/types";

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

/** Minimal CSV parser that handles quoted fields and commas. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = stripBom(text);

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field.trim());
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  row.push(field.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseUkOrIsoDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // DD/MM/YYYY or DD-MM-YYYY
  const uk = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (uk) {
    const day = Number(uk[1]);
    const month = Number(uk[2]) - 1;
    let year = Number(uk[3]);
    if (year < 100) year += 2000;
    const hh = Number(uk[4] ?? 12);
    const mm = Number(uk[5] ?? 0);
    const ss = Number(uk[6] ?? 0);
    const d = new Date(Date.UTC(year, month, day, hh, mm, ss));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = new Date(s);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function poundsToPence(raw: string): number | null {
  const cleaned = raw.replace(/£/g, "").replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function pick(map: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (map[k] != null && map[k] !== "") return map[k];
  }
  return "";
}

/**
 * Parse Monzo export CSV or a generic bank CSV (Date / Description / Amount).
 * Every non-empty body row is either imported into `rows` or listed in `warnings`.
 */
export function parseBankCsv(text: string): StatementParseResult {
  const table = parseCsvText(text);
  if (table.length < 2) {
    return {
      rows: [],
      format: "generic_csv",
      warnings: ["CSV had no data rows"],
      sourceRows: 0,
      skippedRows: 0,
    };
  }

  const headers = table[0].map(normHeader);
  const warnings: string[] = [];
  const rows: ParsedStatementRow[] = [];
  let sourceRows = 0;
  let skippedRows = 0;

  const isMonzo =
    headers.includes("transaction_id") ||
    (headers.includes("date") && headers.includes("name") && headers.includes("amount")) ||
    (headers.includes("money_out") && headers.includes("money_in"));

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (cells.every((c) => !c)) continue;
    sourceRows++;
    const map: Record<string, string> = {};
    headers.forEach((h, idx) => {
      map[h] = cells[idx] ?? "";
    });

    const dateRaw = pick(map, ["date", "transaction_date", "booking_date", "posted_date"]);
    const timeRaw = pick(map, ["time"]);
    const date = parseUkOrIsoDate(timeRaw ? `${dateRaw} ${timeRaw}` : dateRaw);
    if (!date) {
      skippedRows++;
      warnings.push(`Row ${i + 1}: unreadable date "${dateRaw}" — not imported`);
      continue;
    }

    let amountPence: number | null = null;
    const moneyOut = pick(map, ["money_out", "debit", "out"]);
    const moneyIn = pick(map, ["money_in", "credit", "in"]);
    if (moneyOut || moneyIn) {
      const out = moneyOut ? poundsToPence(moneyOut) : 0;
      const inn = moneyIn ? poundsToPence(moneyIn) : 0;
      if (out != null && out !== 0) amountPence = -Math.abs(out);
      else if (inn != null && inn !== 0) amountPence = Math.abs(inn);
      else amountPence = 0;
    } else {
      amountPence = poundsToPence(pick(map, ["amount", "value", "transaction_amount"]));
    }

    if (amountPence == null) {
      skippedRows++;
      warnings.push(`Row ${i + 1}: unreadable amount — not imported`);
      continue;
    }

    const name = pick(map, ["name", "merchant", "payee", "counterparty"]);
    const description =
      pick(map, ["description", "details", "narrative", "reference"]) || name || "Statement line";
    const notes = pick(map, ["notes", "note"]) || null;
    const externalId = pick(map, ["transaction_id", "id", "monzo_transaction_id"]) || null;
    const currency = pick(map, ["currency"]) || "GBP";
    const timeKey = timeRaw || date.toISOString().slice(11, 19);

    rows.push({
      date,
      description,
      merchantName: name || null,
      amountPence,
      currency,
      notes,
      externalId: externalId || null,
      accountHint: null,
      timeKey,
    });
  }

  if (skippedRows > 0) {
    warnings.unshift(
      `${skippedRows} of ${sourceRows} statement line(s) could not be parsed — check the list below so nothing is missed.`
    );
  }

  return {
    rows,
    format: isMonzo ? "monzo_csv" : "generic_csv",
    warnings,
    sourceRows,
    skippedRows,
  };
}

/** Dedup key — always scoped by feed so Personal and Business never collide. */
export function fingerprintRow(
  row: ParsedStatementRow,
  accountType: "personal" | "business" = "personal"
): string {
  if (row.externalId?.startsWith("tx_")) return row.externalId;
  const basis = [
    accountType,
    row.date.toISOString().slice(0, 10),
    row.timeKey ?? "",
    row.amountPence,
    (row.merchantName ?? "").toLowerCase(),
    row.description.toLowerCase().slice(0, 120),
  ].join("|");
  const hash = createHash("sha256").update(basis).digest("hex").slice(0, 24);
  return `upload_${accountType}_${hash}`;
}
