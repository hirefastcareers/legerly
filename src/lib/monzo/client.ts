import { decryptToken, encryptToken } from "@/lib/encryption";
import { prisma } from "@/lib/db";

const MONZO_API = "https://api.monzo.com";
const MONZO_AUTH = "https://auth.monzo.com";

export type MonzoAccount = {
  id: string;
  description: string;
  created: string;
  type?: string;
  currency?: string;
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

function clientCredentials() {
  const clientId = process.env.MONZO_CLIENT_ID;
  const clientSecret = process.env.MONZO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("MONZO_CLIENT_ID and MONZO_CLIENT_SECRET must be set");
  }
  return { clientId, clientSecret };
}

export function getMonzoAuthUrl(state: string, accountType: "personal" | "business"): string {
  const { clientId } = clientCredentials();
  const redirectUri = process.env.MONZO_REDIRECT_URI!;
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
  const redirectUri = process.env.MONZO_REDIRECT_URI!;

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
    throw new Error(`Monzo refresh failed: ${res.status}`);
  }
  return res.json();
}

async function getValidAccessToken(accountId: string): Promise<string> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const accessToken = decryptToken(account.encryptedAccessToken);

  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return accessToken;
  }

  if (!account.encryptedRefreshToken) return accessToken;

  const refreshed = await refreshMonzoToken(decryptToken(account.encryptedRefreshToken));
  await prisma.account.update({
    where: { id: accountId },
    data: {
      encryptedAccessToken: encryptToken(refreshed.access_token),
      encryptedRefreshToken: refreshed.refresh_token
        ? encryptToken(refreshed.refresh_token)
        : account.encryptedRefreshToken,
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    },
  });
  return refreshed.access_token;
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
    throw new Error(`Monzo API ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function listMonzoAccounts(accountId: string): Promise<MonzoAccount[]> {
  const data = await monzoFetch<{ accounts: MonzoAccount[] }>(accountId, "/accounts");
  return data.accounts;
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

/** Paginated transaction fetch using since / before */
export async function fetchAllTransactions(
  accountId: string,
  monzoAccountId: string,
  options?: { since?: string; before?: string }
): Promise<MonzoTransaction[]> {
  const results: MonzoTransaction[] = [];
  let before = options?.before;
  const since = options?.since ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  // Monzo returns newest first; paginate with `before`
  for (let i = 0; i < 50; i++) {
    const params = new URLSearchParams({
      account_id: monzoAccountId,
      limit: "100",
      since,
      "expand[]": "merchant",
    });
    if (before) params.set("before", before);

    const data = await monzoFetch<{ transactions: MonzoTransaction[] }>(
      accountId,
      `/transactions?${params.toString()}`
    );

    const batch = data.transactions ?? [];
    if (batch.length === 0) break;
    results.push(...batch);
    before = batch[batch.length - 1].created;
    if (batch.length < 100) break;
  }

  return results;
}

export async function registerWebhook(
  accountId: string,
  monzoAccountId: string,
  url: string
): Promise<void> {
  const token = await getValidAccessToken(accountId);
  await fetch(`${MONZO_API}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ account_id: monzoAccountId, url }),
  });
}
