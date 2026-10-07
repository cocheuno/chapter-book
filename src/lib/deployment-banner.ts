export type DeploymentBannerKind = "copy" | "live" | "test" | "unknown" | null;

/** Neon endpoint id, matching neonEndpointId in scripts/migration-plan.mjs. */
function endpointId(value: string | undefined): string | null {
  let host = (value ?? "").trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  const id = host.split(".")[0].replace(/-pooler$/, "");
  return /^ep-[a-z0-9-]+$/.test(id) ? id : null;
}

export function deploymentBanner(env: {
  VERCEL_ENV?: string;
  DATABASE_URL?: string;
  PRODUCTION_DB_ENDPOINT?: string;
}): DeploymentBannerKind {
  if (env.VERCEL_ENV === "production") return null;
  if (!(env.DATABASE_URL ?? "").trim()) return "test";
  if (env.VERCEL_ENV === "preview") {
    const db = endpointId(env.DATABASE_URL);
    const prod = endpointId(env.PRODUCTION_DB_ENDPOINT);
    if (db === null || prod === null) return "unknown";
    if (db === prod || db.startsWith(`${prod}-`) || prod.startsWith(`${db}-`)) return "live";
    return "copy";
  }
  return "unknown";
}
