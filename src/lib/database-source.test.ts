import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { databaseSource, type DatabaseSource } from "./database-source.ts";

const neonUrl = "postgres://example.com/book";

describe("databaseSource", () => {
  const cases: Array<
    [string, { databaseUrl: string | undefined; vercelEnv: string | undefined }, DatabaseSource]
  > = [
    ["url and production", { databaseUrl: neonUrl, vercelEnv: "production" }, "neon"],
    ["url and no host env", { databaseUrl: neonUrl, vercelEnv: undefined }, "neon"],
    ["url and blank host env", { databaseUrl: neonUrl, vercelEnv: "  " }, "neon"],
    ["padded url on preview", { databaseUrl: `  ${neonUrl}  `, vercelEnv: "preview" }, "neon"],
    ["no url on production", { databaseUrl: undefined, vercelEnv: "production" }, "missing"],
    ["empty url on preview", { databaseUrl: "", vercelEnv: "preview" }, "missing"],
    ["blank url on development", { databaseUrl: "   ", vercelEnv: "development" }, "missing"],
    ["no url and no host env", { databaseUrl: undefined, vercelEnv: undefined }, "pglite"],
    ["empty url and empty host env", { databaseUrl: "", vercelEnv: "" }, "pglite"],
    ["blank url and blank host env", { databaseUrl: "  ", vercelEnv: "   " }, "pglite"],
  ];

  for (const [label, input, expected] of cases) {
    it(label, () => {
      assert.equal(databaseSource(input), expected);
    });
  }
});
