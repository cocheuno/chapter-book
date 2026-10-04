/**
 * Grok broker sign-in (Google and X through the broker).
 * On when auth is configured and there is no public origin, as in the workspace
 * preview. A set origin keeps it off unless the flag is "on".
 */
export function brokerSignInEnabled(input: {
  authConfigured: boolean;
  betterAuthUrl?: string;
  flag?: string;
}): boolean {
  if (!input.authConfigured) return false;
  if ((input.betterAuthUrl ?? "").trim() === "") return true;
  return (input.flag ?? "").trim().toLowerCase() === "on";
}
