export type ParsedStatementRow = {
  date: Date;
  description: string;
  merchantName?: string | null;
  amountPence: number; // negative = money out
  currency?: string;
  notes?: string | null;
  externalId?: string | null; // Monzo tx id if present in CSV
  accountHint?: "personal" | "business" | null;
  /** HH:mm:ss when present — keeps same-day identical spends distinct */
  timeKey?: string | null;
};

export type StatementParseResult = {
  rows: ParsedStatementRow[];
  format: "monzo_csv" | "generic_csv" | "ai_statement";
  warnings: string[];
  /** Non-empty CSV body rows seen (before date/amount validation) */
  sourceRows: number;
  /** Rows dropped because date/amount could not be read */
  skippedRows: number;
};
