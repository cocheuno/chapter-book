import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  busyError,
  runInTransaction,
  runSavepoint,
  savepointName,
  type TransactionClient,
} from "./transaction-rules.ts";

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

  it("runs setup statements after begin and before the work", async () => {
    const { calls, client } = fakeClient();
    const setup = [
      "set local lock_timeout = '5s'",
      "set local statement_timeout = '15s'",
      "set local idle_in_transaction_session_timeout = '30s'",
    ];
    let during: string[] = [];
    const value = await runInTransaction(
      client,
      async () => {
        during = [...calls];
        return "kept";
      },
      setup,
    );
    assert.equal(value, "kept");
    assert.deepEqual(during, ["begin", ...setup]);
    assert.deepEqual(calls, ["begin", ...setup, "commit", "release"]);
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

describe("busyError", () => {
  it("turns a lock or statement timeout into one sentence and leaves other errors alone", () => {
    const busy = "The book is busy. Please try again in a moment.";
    const lock = busyError({ code: "55P03" });
    const statement = busyError({ code: "57014" });
    assert.ok(lock instanceof Error && lock.message === busy);
    assert.ok(statement instanceof Error && statement.message === busy);
    const other = new Error("nope");
    assert.equal(busyError(other), other);
    assert.equal(busyError("nope"), "nope");
  });

  it("the postgres path sets the three timeouts, in order, and maps the busy error", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "db.ts"), "utf8");
    const lock = source.indexOf("set local lock_timeout = '5s'");
    const statement = source.indexOf("set local statement_timeout = '15s'");
    const idle = source.indexOf("set local idle_in_transaction_session_timeout = '30s'");
    assert.ok(lock >= 0 && lock < statement && statement < idle);
    assert.equal(source.includes("throw busyError(err)"), true);
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
