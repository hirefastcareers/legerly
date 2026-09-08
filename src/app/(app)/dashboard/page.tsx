import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="animate-pulse text-stone-500">Loading workspace…</div>}>
      <DashboardClient />
    </Suspense>
  );
}
