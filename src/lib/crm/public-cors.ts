const ALLOWED = new Set([
  "https://scs-wisconsin-usa.org",
  "http://scs-wisconsin-usa.org",
  "https://www.scs-wisconsin-usa.org",
  "http://www.scs-wisconsin-usa.org",
]);

function originAllowed(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED.has(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) return true;
  if (/^https:\/\/[\w.-]+\.vercel\.app$/i.test(origin)) return true;
  return false;
}

export function publicSiteCorsHeaders(request: Request): Headers {
  const origin = request.headers.get("origin") ?? "";
  const headers = new Headers();
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Cache-Control", "no-store");
  if (originAllowed(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}
