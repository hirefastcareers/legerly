/** True only when explicitly enabled — production must leave this unset or false. */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function hasMonzoCredentials(): boolean {
  return Boolean(process.env.MONZO_CLIENT_ID?.trim() && process.env.MONZO_CLIENT_SECRET?.trim());
}

/**
 * AI categorisation / OCR is opt-in to keep running costs near zero.
 * Rules engine + manual review work without OpenAI.
 */
export function isAiEnabled(): boolean {
  return process.env.ENABLE_AI === "true" && Boolean(process.env.OPENAI_API_KEY?.trim());
}
