/**
 * Response headers for deployed Chapter Book and the workspace preview.
 * A set BETTER_AUTH_URL means Vercel. The workspace preview leaves it blank
 * and shows the app in an iframe, so framing headers stay off there.
 */

const ALWAYS_SECURITY_HEADERS: readonly (readonly [string, string])[] = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
];

/** Report-only until TanStack Start supports nonces. */
export const SECURITY_CSP_REPORT_ONLY =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-src https://challenges.cloudflare.com; form-action 'self' https://checkout.stripe.com; base-uri 'self'; frame-ancestors 'none'";

const DEPLOYED_SECURITY_HEADERS: readonly (readonly [string, string])[] = [
  ["Strict-Transport-Security", "max-age=31536000"],
  ["X-Frame-Options", "DENY"],
  ["Content-Security-Policy-Report-Only", SECURITY_CSP_REPORT_ONLY],
];

export function securityHeaderEntries(
  betterAuthUrl: string | undefined,
): readonly (readonly [string, string])[] {
  if ((betterAuthUrl ?? "").trim() === "") return ALWAYS_SECURITY_HEADERS;
  return [...ALWAYS_SECURITY_HEADERS, ...DEPLOYED_SECURITY_HEADERS];
}

/** Add security headers that are not already set. */
export function applySecurityHeaders(headers: Headers, betterAuthUrl: string | undefined): void {
  for (const [name, value] of securityHeaderEntries(betterAuthUrl)) {
    if (!headers.has(name)) headers.set(name, value);
  }
}
