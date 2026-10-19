/** Where queries run. A hosted deployment with no database URL must not open PGLite. */
export type DatabaseSource = "neon" | "missing" | "pglite";

function blank(value: string | undefined): boolean {
  return (value ?? "").trim() === "";
}

/** Neon when a database URL is set. Missing on a hosted deployment with no URL. Otherwise PGLite. */
export function databaseSource(input: {
  databaseUrl: string | undefined;
  vercelEnv: string | undefined;
}): DatabaseSource {
  if (!blank(input.databaseUrl)) return "neon";
  if (!blank(input.vercelEnv)) return "missing";
  return "pglite";
}
