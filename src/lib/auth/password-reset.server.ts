import { getSql } from "../db";
import { takeResetToken } from "./reset-store.server";
import { auth } from "./server";

/** Issue a one-time token. An earlier reset link for this operator stops working. */
export async function issueResetToken(userId: string, email: string): Promise<string> {
  const sql = await getSql();
  await sql`
    delete from verification
    where identifier like 'reset-password:%' and value = ${userId}
  `;
  await auth.api.requestPasswordReset({ body: { email } });
  const token = takeResetToken(userId);
  if (!token) throw new Error("Could not create a reset link.");
  return token;
}
