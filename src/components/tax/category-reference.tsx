import { HMRC_CATEGORY_LIST, type HmrcCategoryKey } from "@/lib/tax/hmrc-categories";
import { cn } from "@/lib/utils";

export function CategoryReferenceList({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3", className)}>
      {HMRC_CATEGORY_LIST.map((c) => (
        <div
          key={c.key}
          className="rounded-lg border border-stone-200 p-3 dark:border-stone-800"
        >
          <div className="text-xs text-stone-500">{c.sa103Box}</div>
          <div className="font-medium">{c.label}</div>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">{c.description}</p>
          {"examples" in c && c.examples && (
            <p className="mt-2 text-[11px] text-stone-400">
              <span className="font-medium text-stone-500">Examples: </span>
              {c.examples}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function categoryLabel(key: string | null | undefined): string {
  if (!key) return "Uncategorised";
  const c = HMRC_CATEGORY_LIST.find((x) => x.key === key);
  return c?.label ?? key;
}

export function categoryDescription(key: HmrcCategoryKey | string | null | undefined): string {
  if (!key) return "";
  const c = HMRC_CATEGORY_LIST.find((x) => x.key === key);
  return c?.description ?? "";
}
