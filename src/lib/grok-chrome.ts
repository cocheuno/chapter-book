/**
 * Grok page chrome (the grok.com script and share-tag rewriting).
 * "off" always turns it off. "on" always turns it on.
 * Anything else is on only when both BETTER_AUTH_URL and VERCEL_ENV are blank
 * (the Grok workspace or a local machine).
 */
export function grokChromeEnabled(
  value: string | undefined,
  betterAuthUrl: string | undefined,
  vercelEnv: string | undefined,
): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "off") return false;
  if (v === "on") return true;
  return (betterAuthUrl ?? "").trim() === "" && (vercelEnv ?? "").trim() === "";
}
