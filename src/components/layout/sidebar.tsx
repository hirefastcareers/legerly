"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Calculator,
  Tags,
  Receipt,
  Moon,
  Sun,
  Landmark,
  FileUp,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions Engine", icon: ArrowLeftRight },
  { href: "/statements", label: "Import statements", icon: FileUp },
  { href: "/tax", label: "Tax Summary & HMRC Boxes", icon: Calculator },
  { href: "/rules", label: "Rules & Categories", icon: Tags },
  { href: "/receipts", label: "Receipts & Audit", icon: Receipt },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-stone-200 bg-stone-50/80 dark:border-stone-800 dark:bg-stone-950/80">
      <div className="flex items-center gap-2 border-b border-stone-200 px-5 py-5 dark:border-stone-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white">
          <Landmark className="h-5 w-5" />
        </div>
        <div>
          <div className="font-serif text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Ledgerly
          </div>
          <div className="text-[11px] uppercase tracking-wider text-stone-500">
            UK Sole Trader Tax
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-teal-700 text-white shadow-sm"
                  : "text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="leading-snug">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-stone-200 p-3 dark:border-stone-800">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="ml-6">Toggle theme</span>
        </Button>
      </div>
    </aside>
  );
}
