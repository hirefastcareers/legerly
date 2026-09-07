import { cn } from "@/lib/utils";

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "secondary" | "success" | "warning" | "outline";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
        variant === "default" && "bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-100",
        variant === "secondary" && "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
        variant === "success" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100",
        variant === "warning" && "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
        variant === "outline" && "border border-stone-300 text-stone-700 dark:border-stone-600 dark:text-stone-200",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
