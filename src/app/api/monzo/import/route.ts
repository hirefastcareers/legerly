import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import {
  checkMonzoApproval,
  getAwaitingConnection,
  importAfterApproval,
} from "@/lib/monzo/link-accounts";

/** Check whether the user has approved access in the Monzo app yet. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const awaiting = await getAwaitingConnection(userId);
    if (!awaiting) {
      return NextResponse.json({ awaiting: false, ready: false });
    }
    const status = await checkMonzoApproval(awaiting.id);
    return NextResponse.json({
      awaiting: true,
      ready: status.ready,
      message: status.message,
      monzoUserId: awaiting.monzoUserId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 500 });
  }
}

/**
 * User confirmed they approved in the Monzo app — discover accounts + full history import.
 * Must be clicked soon after approval so SCA allows full tax-year history.
 */
export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await importAfterApproval(userId, { fullHistory: true });
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Imported full history for ${result.synced} of ${result.accounts.length} account(s).`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === "NO_TOKEN") {
      return NextResponse.json(
        { ok: false, error: "No Monzo login found. Click Connect Monzo first." },
        { status: 400 }
      );
    }
    if (msg === "NO_ACCOUNTS") {
      return NextResponse.json(
        { ok: false, error: "Monzo returned no open accounts for this login." },
        { status: 400 }
      );
    }
    if (msg.startsWith("NOT_APPROVED:")) {
      return NextResponse.json(
        {
          ok: false,
          awaiting: true,
          error: msg.replace(/^NOT_APPROVED:/, "").trim(),
          hint: "Open the Monzo app, approve the access request (push notification), then click Import again.",
        },
        { status: 403 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
