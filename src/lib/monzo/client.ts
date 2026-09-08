import { decryptToken, encryptToken } from "@/lib/encryption";
import { prisma } from "@/lib/db";

const MONZO_API = "https://api.monzo.com";
const MONZO_AUTH = "https://auth.monzo.com";

/** After SCA cools down, Monzo only allows ~90 days of transaction history. */
export const MONZO_SAFE_HISTORY_DAYS = 90;

export type MonzoAccount = {
  id: string;
  description: string;
  created: string;
  type?: string;
  currency?: string;
  closed?: boolean;
  owner?: { preferred_name?: string };
};

export type MonzoTransaction = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  created: string;
  settled?: string;
  notes?: string;
  category?: string;
  merchant?: { name?: string; category?: string } | null;
  metadata?: Record<string, string>;
  decline_reason?: string;
  is_load?: boolean;
  scheme?: string;
  attachments?: Array<{ id: string; file_url?: string; file_type?: string }>;
};

export class MonzoApiError extends Error {
  status: number;
  path: string;
  body: string;
  code?: string;

  constructor(status: number, path: string, body: string) {
    let code: string | undefined;
    let message = `Monzo API ${path} failed: ${status}`;
    try {
      const parsed = JSON.parse(body) as { code?: string; message?: string; error?: string };
      code = parsed.code ?? parsed.error;
      if (parsed.message) message = `Monzo: ${parsed.message}`;
      else if (code) message = `Monzo: ${code}`;
    } catch {
      if (body) message = `Monzo API ${path} failed: ${status} ${body.slice(0, 200)}`;
    }
    super(message);
    this.name = "MonzoApiError";
    this.status = status;
    this.path = path;
    this.body = body;
    this.code = code;
  }

  get needsReauth(): boolean {
    return (
      this.status === 401 ||
      this.status === 403 ||
      this.code === "forbidden.verification_required" ||
      /verification required/i.test(this.message)
    );
  }

  get userHint(): string {
    if (/evicted|login elsewhere/i.test(this.message) || /evicted|login elsewhere/i.test(this.body)) {
      return "Monzo revoked this token because another login created a new one. Use a single Connect Monzo (not Personal then Business separately), approve in the app, and wait for the full import.";
    }
    if (this.code === "forbidden.verification_required" || /verification required/i.test(this.message)) {
      return "Monzo blocked a long history request outside the fresh-login window. Click Reconnect Monzo (full history) to import your tax year, then use Sync for new activity only.";
    }
    if (this.status === 403) {
      return "Open the Monzo app → approve this client, or Profile → Settings → Manage apps → refresh access, then Reconnect Monzo.";
    }
    if (this.status === 401) {
      return "Monzo access token expired or invalid. Click Reconnect Monzo and approve in the app.";
    }
    return this.message;
  }
}

function clientCredentials() {
  const clientId = process.env.MONZO_CLIENT_ID?.trim();
  const clientSecret = process.env.MONZO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("MONZO_CLIENT_ID and MONZO_CLIENT_SECRET must be set");
  }
  return { clientId, clientSecret };
}

export function getMonzoAuthUrl(state: string, accountType: "personal" | "business"): string {
  const { clientId } = clientCredentials();
  const redirectUri = process.env.MONZO_REDIRECT_URI!.trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: `${accountType}:${state}`,
  });
  return `${MONZO_AUTH}/?${params.toString()}`;
}

export async function exchangeMonzoCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  user_id: string;
}> {
  const { clientId, clientSecret } = clientCredentials();
  const redirectUri = process.env.MONZO_REDIRECT_URI!.trim();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(`${MONZO_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monzo token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function refreshMonzoToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const { clientId, clientSecret } = clientCredentials();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`${MONZO_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new MonzoApiError(res.status, "/oauth2/token", text);
  }
  return res.json();
}

async function getValidAccessToken(accountId: string): Promise<string> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });

  if (account.encryptedAccessToken === "demo") {
    throw new Error("Demo account cannot call Monzo API");
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(account.encryptedAccessToken);
  } catch {
    throw new Error(
      "Could not decrypt Monzo token. If you rotated TOKEN_ENCRYPTION_KEY, reconnect Monzo."
    );
  }

  const stillValid =
    account.tokenExpiresAt && account.tokenExpiresAt.getTime() > Date.now() + 60_000;

  if (stillValid) return accessToken;

  if (!account.encryptedRefreshToken || account.encryptedRefreshToken === "demo") {
    return accessToken;
  }

  try {
    const refreshed = await refreshMonzoToken(decryptToken(account.encryptedRefreshToken));
    const encryptedAccess = encryptToken(refreshed.access_token);
    const encryptedRefresh = refreshed.refresh_token
      ? encryptToken(refreshed.refresh_token)
      : account.encryptedRefreshToken;
    const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    // Same Monzo user must share one live token — update every linked feed
    if (account.monzoUserId) {
      await prisma.account.updateMany({
        where: { monzoUserId: account.monzoUserId },
        data: {
          encryptedAccessToken: encryptedAccess,
          encryptedRefreshToken: encryptedRefresh,
          tokenExpiresAt,
        },
      });
    } else {
      await prisma.account.update({
        where: { id: accountId },
        data: {
          encryptedAccessToken: encryptedAccess,
          encryptedRefreshToken: encryptedRefresh,
          tokenExpiresAt,
        },
      });
    }
    return refreshed.access_token;
  } catch (err) {
    if (err instanceof MonzoApiError) throw err;
    return accessToken;
  }
}

export async function monzoFetch<T>(
  accountId: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getValidAccessToken(accountId);
  const res = await fetch(`${MONZO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new MonzoApiError(res.status, path.split("?")[0], text);
  }
  return res.json() as Promise<T>;
}

export async function listMonzoAccounts(accountId: string): Promise<MonzoAccount[]> {
  const data = await monzoFetch<{ accounts: MonzoAccount[] }>(accountId, "/accounts");
  return (data.accounts ?? []).filter((a) => !a.closed);
}

export function inferAccountType(account: MonzoAccount): "personal" | "business" {
  const type = (account.type ?? "").toLowerCase();
  const desc = (account.description ?? "").toLowerCase();
  if (type.includes("business") || desc.includes("business")) return "business";
  return "personal";
}

export function isPotTransfer(tx: MonzoTransaction): boolean {
  const meta = tx.metadata ?? {};
  if (meta.pot_id || meta.trigger === "pot") return true;
  const desc = (tx.description ?? "").toLowerCase();
  if (desc.includes("pot") && (desc.includes("transfer") || desc.startsWith("pot_"))) return true;
  if (tx.scheme === "uk_retail_pot") return true;
  return false;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Paginated transaction fetch — defaults to last 90 days (Monzo SCA limit). */
export async function fetchAllTransactions(
  accountId: string,
  monzoAccountId: string,
  options?: { since?: string; before?: string; fullHistory?: boolean }
): Promise<MonzoTransaction[]> {
  const results: MonzoTransaction[] = [];
  let before = options?.before;
  // fullHistory only works in the ~5 minute window after SCA approval
  const since =
    options?.since ??
    daysAgoIso(options?.fullHistory ? 365 * 3 : MONZO_SAFE_HISTORY_DAYS);

  for (let i = 0; i < 50; i++) {
    const params = new URLSearchParams({
      account_id: monzoAccountId,
      limit: "100",
      since,
    });
    params.append("expand[]", "merchant");
    if (before) params.set("before", before);

    try {
      const data = await monzoFetch<{ transactions: MonzoTransaction[] }>(
        accountId,
        `/transactions?${params.toString()}`
      );

      const batch = data.transactions ?? [];
      if (batch.length === 0) break;
      results.push(...batch);
      before = batch[batch.length - 1].created;
      if (batch.length < 100) break;
    } catch (err) {
      // If long history is forbidden, retry once with 90-day window
      if (
        err instanceof MonzoApiError &&
        err.needsReauth &&
        options?.fullHistory &&
        !options.since
      ) {
        return fetchAllTransactions(accountId, monzoAccountId, {
          before: options.before,
          fullHistory: false,
        });
      }
      throw err;
    }
  }

  return results;
}

export async function pingMonzo(accountId: string): Promise<{ authenticated: boolean; userId?: string }> {
  const data = await monzoFetch<{ authenticated: boolean; client?: { user_id?: string } }>(
    accountId,
    "/ping/whoami"
  );
  return { authenticated: data.authenticated, userId: data.client?.user_id };
}
