import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runInTransaction, type TransactionClient } from "./transaction-rules.ts";

function fakeClient(opts?: { rollbackError?: string; releaseError?: string }) {
  const calls: string[] = [];
  const client: TransactionClient = {
    async query(text: string) {
      calls.push(text);
      if (text === "rollback" && opts?.rollbackError) throw new Error(opts.rollbackError);
      return [];
    },
    release() {
      calls.push("release");
      if (opts?.releaseError) throw new Error(opts.releaseError);
    },
  };
  return { calls, client };
}

describe("runInTransaction", () => {
  it("commits and releases on success", async () => {
    const { calls, client } = fakeClient();
    const value = await runInTransaction(client, async () => "kept");
    assert.equal(value, "kept");
    assert.deepEqual(calls, ["begin", "commit", "release"]);
  });

  it("rolls back, rethrows, and releases on error", async () => {
    const { calls, client } = fakeClient();
    await assert.rejects(
      () =>
        runInTransaction(client, async () => {
          throw new Error("nope");
        }),
      (err: unknown) => err instanceof Error && err.message === "nope",
    );
    assert.deepEqual(calls, ["begin", "rollback", "release"]);
  });

  it("a failing rollback does not hide the original error, and still releases", async () => {
    const { calls, client } = fakeClient({ rollbackError: "rollback failed" });
    await assert.rejects(
      () =>
        runInTransaction(client, async () => {
          throw new Error("original");
        }),
      (err: unknown) => err instanceof Error && err.message === "original",
    );
    assert.deepEqual(calls, ["begin", "rollback", "release"]);
  });

  it("a failing release does not hide the original error", async () => {
    const { client } = fakeClient({ releaseError: "release failed" });
    await assert.rejects(
      () =>
        runInTransaction(client, async () => {
          throw new Error("original");
        }),
      (err: unknown) => err instanceof Error && err.message === "original",
    );
  });
});
