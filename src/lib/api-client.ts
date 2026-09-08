"use client";

export async function apiJson<T>(input: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(input, init);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (res.status === 401) {
    window.location.assign("/login");
    return null;
  }

  if (!res.ok) {
    const message =
      json &&
      typeof json === "object" &&
      "error" in json &&
      typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return json as T;
}
