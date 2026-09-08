export type ParsedStatementRow = {
  date: Date;
  description: string;
  merchantName?: string | null;
  amountPence: number; // negative = money out
  currency?: string;
  notes?: string | null;
  externalId?: string | null; // Monzo tx id if present in CSV
  accountHint?: "personal" | "business" | null;
};

export type StatementParseResult = {
  rows: ParsedStatementRow[];
  format: "monzo_csv" | "generic_csv" | "ai_statement";
  warnings: string[];
};
