import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runInTransaction, runSavepoint, savepointName, type TransactionClient } from "./transaction-rules.ts";

function fakeClient(opts?: { rollbackError?: string; releaseError?: string; commitCommand?: string }) {
  const calls: string[] = [];
  let releasedWith: unknown = "not-released";
  const client: TransactionClient = {
    async query(text: string) {
      calls.push(text);
      if (text === "rollback" && opts?.rollbackError) throw new Error(opts.rollbackError);
      if (text === "commit") return { command: opts?.commitCommand ?? "COMMIT" };
      return [];
    },
    release(err?: unknown) {
      calls.push("release");
      releasedWith = err;
      if (opts?.releaseError) throw new Error(opts.releaseError);
    },
  };
  return { calls, client, released: () => releasedWith };
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

  it("a failing rollback does not hide the original error, and releases with that error", async () => {
    const bag = fakeClient({ rollbackError: "rollback failed" });
    await assert.rejects(
      () =>
        runInTransaction(bag.client, async () => {
          throw new Error("original");
        }),
      (err: unknown) => err instanceof Error && err.message === "original",
    );
    assert.deepEqual(bag.calls, ["begin", "rollback", "release"]);
    assert.ok(bag.released() instanceof Error);
    assert.equal((bag.released() as Error).message, "rollback failed");
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

  it("throws when commit reports ROLLBACK", async () => {
    const { calls, client, released } = fakeClient({ commitCommand: "ROLLBACK" });
    await assert.rejects(
      () => runInTransaction(client, async () => "kept"),
      (err: unknown) => err instanceof Error && err.message === "The change could not be saved.",
    );
    assert.deepEqual(calls, ["begin", "commit", "rollback", "release"]);
    assert.equal(released(), undefined);
  });
});

describe("runSavepoint", () => {
  it("names a savepoint from the random text", () => {
    assert.equal(savepointName("AbC12"), "sp_abc12");
  });

  it("releases the savepoint after the work succeeds", async () => {
    const calls: string[] = [];
    const client = {
      async query(text: string) {
        calls.push(text);
        return [];
      },
    };
    const value = await runSavepoint(client, "sp_abc", async () => "kept");
    assert.equal(value, "kept");
    assert.deepEqual(calls, ["savepoint sp_abc", "release savepoint sp_abc"]);
  });

  it("rolls back to the savepoint and rethrows", async () => {
    const calls: string[] = [];
    const client = {
      async query(text: string) {
        calls.push(text);
        return [];
      },
    };
    await assert.rejects(
      () =>
        runSavepoint(client, "sp_abc", async () => {
          throw new Error("duplicate");
        }),
      (err: unknown) => err instanceof Error && err.message === "duplicate",
    );
    assert.deepEqual(calls, ["savepoint sp_abc", "rollback to savepoint sp_abc"]);
  });

  it("still rethrows the original error when the savepoint rollback fails", async () => {
    const calls: string[] = [];
    const client = {
      async query(text: string) {
        calls.push(text);
        if (text.startsWith("rollback to savepoint")) throw new Error("rollback failed");
        return [];
      },
    };
    await assert.rejects(
      () =>
        runSavepoint(client, "sp_abc", async () => {
          throw new Error("duplicate");
        }),
      (err: unknown) => err instanceof Error && err.message === "duplicate",
    );
    assert.deepEqual(calls, ["savepoint sp_abc", "rollback to savepoint sp_abc"]);
  });
});
