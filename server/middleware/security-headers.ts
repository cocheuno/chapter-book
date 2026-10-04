/**
 * Security headers on every response. Auto-registered as global h3 middleware
 * because vite.config.ts sets `serverDir: "./server"`.
 *
 * An existing header is left alone, so CORS on /api/public-site and anything
 * the host already set stay as they are.
 */
import { applySecurityHeaders } from "../../src/lib/security-headers";

interface SecurityHeadersEvent {
  res: { headers: Headers };
}

export default async function securityHeadersMiddleware(
  event: SecurityHeadersEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const result = await next();
  if (result instanceof Response) {
    const headers = new Headers(result.headers);
    applySecurityHeaders(headers, process.env.BETTER_AUTH_URL);
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }
  applySecurityHeaders(event.res.headers, process.env.BETTER_AUTH_URL);
  return result;
}
