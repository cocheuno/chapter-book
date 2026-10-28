/**
 * Begin / commit / rollback / release for one checked-out client.
 * No database driver and no `@/` imports, so node tests can fake the client.
 */

export type TransactionClient = {
  query(text: string, params?: unknown[]): Promise<unknown>;
  release(err?: unknown): void | Promise<void>;
};

function commandOf(result: unknown): string | null {
  if (!result || typeof result !== "object" || !("command" in result)) return null;
  const command = (result as { command: unknown }).command;
  return typeof command === "string" ? command : null;
}

/**
 * Run `work` between begin and commit. On any error, roll back and rethrow
 * that error. Always release the client. A failing rollback or release does
 * not replace the original error. A failed rollback is passed to `release`
 * so the pool discards the connection. A commit that reports ROLLBACK is
 * not treated as a saved change.
 */
export async function runInTransaction<T>(
  client: TransactionClient,
  work: () => Promise<T>,
): Promise<T> {
  let failed = false;
  let error: unknown;
  let value: T | undefined;
  let rollbackError: unknown;
  try {
    await client.query("begin");
    value = await work();
    const committed = await client.query("commit");
    if (commandOf(committed) === "ROLLBACK") {
      throw new Error("The change could not be saved.");
    }
  } catch (err) {
    failed = true;
    error = err;
    try {
      await client.query("rollback");
    } catch (rollbackErr) {
      // A failing rollback must not hide the original error.
      rollbackError = rollbackErr;
    }
  }
  try {
    if (rollbackError !== undefined) await client.release(rollbackError);
    else await client.release();
  } catch (releaseError) {
    if (!failed) throw releaseError;
  }
  if (failed) throw error;
  return value as T;
}

/** `sp_` plus the hex (or other letters and digits) from `random`. */
export function savepointName(random: string): string {
  const hex = random.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!hex) throw new Error("The change could not be saved.");
  return `sp_${hex}`;
}

/**
 * `savepoint`, then `fn`. On success, `release savepoint`. On error,
 * `rollback to savepoint` and rethrow so the surrounding transaction can continue.
 */
export async function runSavepoint<T>(
  client: { query(text: string): Promise<unknown> },
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!/^sp_[a-z0-9]+$/.test(name)) throw new Error("The change could not be saved.");
  await client.query(`savepoint ${name}`);
  try {
    const value = await fn();
    await client.query(`release savepoint ${name}`);
    return value;
  } catch (err) {
    try {
      await client.query(`rollback to savepoint ${name}`);
    } catch {
      // A failing rollback must not hide the original error.
    }
    throw err;
  }
}
