import { createServerFn } from "@tanstack/react-start";
import { deploymentBanner } from "@/lib/deployment-banner";

export const getDeploymentBanner = createServerFn({ method: "GET" }).handler(async () =>
  deploymentBanner({
    VERCEL_ENV: process.env.VERCEL_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    PRODUCTION_DB_ENDPOINT: process.env.PRODUCTION_DB_ENDPOINT,
  }),
);
