import { createServerFn } from "@tanstack/react-start";
import { publicOrigin } from "./page-head";

export const getPublicOrigin = createServerFn({ method: "GET" }).handler(async () =>
  publicOrigin({
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  }),
);
