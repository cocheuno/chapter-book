/**
 * Grok page chrome (the grok.com script and share-tag rewriting).
 * On when BETTER_AUTH_URL is blank (the Grok workspace).
 * On a hosted deployment, on only when the value is exactly "on".
 */
export function grokChromeEnabled(
  value: string | undefined,
  betterAuthUrl: string | undefined,
): boolean {
  if ((betterAuthUrl ?? "").trim() === "") return true;
  return (value ?? "").trim().toLowerCase() === "on";
}
