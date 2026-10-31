import type { getSql } from "@/lib/db";
import { turnstileMode } from "@/lib/payments/registration-rules";
import { registrationOpen } from "./book-registration";

type Sql = Awaited<ReturnType<typeof getSql>>;

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Spam check for this process: verify, skip, or misconfigured. */
export function spamModeNow(): "skip" | "verify" | "misconfigured" {
  return turnstileMode(
    {
      siteKey: readEnv("TURNSTILE_SITE_KEY"),
      secretKey: readEnv("TURNSTILE_SECRET_KEY"),
    },
    readEnv("VERCEL_ENV"),
  );
}

/** True when the host flag, the spam check, and this event's switch are all open. */
export async function eventRegistrationOpen(sql: Sql, chapterId: string, eventId: string): Promise<boolean> {
  const rows = await sql<{ use_book_registration: boolean | null }>`
    select use_book_registration
    from registration_pages
    where event_id = ${eventId} and chapter_id = ${chapterId}
  `;
  return registrationOpen({
    flag: readEnv("BOOK_REGISTRATION"),
    spamMode: spamModeNow(),
    eventSwitch: rows[0]?.use_book_registration === true,
  });
}

/** Current attempts for this key. An expired hour counts as zero. */
export async function throttleCount(sql: Sql, key: string): Promise<number> {
  const rows = await sql<{ count: number | string }>`
    select case
      when window_start < now() - interval '1 hour' then 0
      else count
    end as count
    from public_throttle
    where key = ${key}
  `;
  const count = Number(rows[0]?.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}

/** Count one failed attempt. Errors from the write are ignored. */
export async function recordThrottleFailure(sql: Sql, key: string): Promise<void> {
  try {
    await sql`
      insert into public_throttle (key, window_start, count) values (${key}, now(), 1)
      on conflict (key) do update set
        count = case when public_throttle.window_start < now() - interval '1 hour' then 1 else public_throttle.count + 1 end,
        window_start = case when public_throttle.window_start < now() - interval '1 hour' then now() else public_throttle.window_start end
    `;
  } catch {
    // A counting failure must not hide the visitor's error.
  }
}
