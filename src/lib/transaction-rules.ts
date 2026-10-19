/**
 * Begin / commit / rollback / release for one checked-out client.
 * No database driver and no `@/` imports, so node tests can fake the client.
 */

export type TransactionClient = {
  query(text: string, params?: unknown[]): Promise<unknown>;
  release(): void | Promise<void>;
};

/**
 * Run `work` between begin and commit. On any error, roll back and rethrow
 * that error. Always release the client. A failing rollback or release does
 * not replace the original error.
 */
export async function runInTransaction<T>(
  client: TransactionClient,
  work: () => Promise<T>,
): Promise<T> {
  let failed = false;
  let error: unknown;
  let value: T | undefined;
  try {
    await client.query("begin");
    value = await work();
    await client.query("commit");
  } catch (err) {
    failed = true;
    error = err;
    try {
      await client.query("rollback");
    } catch {
      // A failing rollback must not hide the original error.
    }
  }
  try {
    await client.release();
  } catch (releaseError) {
    if (!failed) throw releaseError;
  }
  if (failed) throw error;
  return value as T;
}
