# Mail: build it now, switch it on later

**Status:** Proposed. Build the outbox with Phase 1 of `docs/PAYMENTS.md`. Switch on sending when the chapter has a mailbox. Nothing here needs a mailbox to build.

## What happens today

- **Nothing is sent.** `sendMail` (`src/lib/crm/actions.ts:1875`) writes `mailings`, `mail_messages`, and touches with status `'sent'`, but no mail leaves the server. Because the desk says "sent," someone may believe a bulletin request went out when it did not.
  - Fix: until a mailer exists, record **new** sends as `'recorded'` and label them "Recorded, not sent." Existing rows keep their status (BUILD-PLAN.md, Rule 1); the desk can label past sends "Recorded, not sent" because no mailer existed then.
- **The unsubscribe link is fake.** The `{{unsubscribe_url}}` merge field is the literal text `(unsubscribe)` (`actions.ts:1639`).
- **Bounces are never counted.** `persons.email_bounce_count` exists, but nothing writes to it.

## The seam: build this now

Everything that wants to send writes a row to one outbox table. One sender reads the table. Until a provider is set up, rows wait with status `held`, and nothing is lost.

```sql
create table if not exists mail_outbox (
  id text primary key,
  chapter_id text not null,
  stream text not null check (stream in ('transactional', 'broadcast')),
  template_key text,
  to_address text not null,
  to_name text,
  person_id text,
  registration_id text,
  mailing_id text,
  subject text not null,
  text_body text not null,
  html_body text,
  status text not null default 'held' check (status in
    ('held', 'queued', 'sending', 'sent', 'failed', 'bounced', 'cancelled')),
  send_after timestamptz,
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists mail_outbox_status_idx on mail_outbox (status, send_after);
```

The two streams follow different rules:

| Stream | What | Rules |
| --- | --- | --- |
| `transactional` | Registration confirmations, consent requests to guardians, schedule changes, receipts for checks and cash | Sent to people who registered. No news opt-in needed. **No marketing in these messages** |
| `broadcast` | Mail desk sends (invitations, bulletin requests, newsletters) | Skips `email_unsubscribed`, `do_not_contact`, and `news_consent = 'no'`. Needs a working unsubscribe link and a postal address |

```ts
// src/lib/mail/mailer.server.ts
import { env } from "@/lib/env.server";

export type OutgoingMail = {
  stream: "transactional" | "broadcast";
  to: string;
  toName?: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  idempotencyKey: string; // the outbox row id
};

export interface Mailer {
  name: string;
  send(mail: OutgoingMail): Promise<{ id: string }>;
}

/** null until the chapter has a mailbox: outbox rows stay 'held'. */
export function mailer(): Mailer | null {
  switch (env("MAIL_PROVIDER")) {
    case "resend":
      return resendMailer(env("RESEND_API_KEY"));
    case "postmark":
      return postmarkMailer(env("POSTMARK_SERVER_TOKEN"));
    default:
      return null;
  }
}
```

Rules for the seam:

1. **Code never sends directly.** It inserts an outbox row: `queued` when `mailer()` is set, `held` otherwise.
2. **A drain route** (`src/routes/api/mail/drain.ts`) sends queued rows.
   - It is called by Vercel Cron, protected by `CRON_SECRET`: Vercel sends `Authorization: Bearer <CRON_SECRET>`.
   - It claims rows in **one** statement, so two runs never send the same message:

   ```sql
   update mail_outbox set status = 'sending', attempts = attempts + 1
   where id in (
     select id from mail_outbox
     where status = 'queued' and (send_after is null or send_after <= now())
     order by created_at limit 50
     for update skip locked
   )
   returning *
   ```

   - Pass the row id as the provider's idempotency key, if the provider has one (Resend does).
   - After 5 failed attempts the row becomes `failed` and appears on the Mail desk.
   - Vercel Hobby crons run at most once a day. Pro can run every few minutes; the book should be on Pro for payments anyway.
3. **"Release held mail"** is a button on the Mail desk, shown once a mailer is configured. It shows counts by template, for example "37 registration confirmations held since January 11." An operator chooses what to send, because some held messages may be stale by then.
4. **New merge fields:**
   - `{{salutation}}` (review section 5)
   - `{{manage_url}}`
   - `{{registration_code}}`
   - `{{unsubscribe_url}}`, now a real link

5. **Templates accept `<section>` HTML,** like every public field (review section 7).
   - When a template body is `<section>…</section>`, the sanitized HTML becomes `html_body` and its plain words (`announcementPlainText`) become `text_body`. A plain body stays text only.
   - Mail clients ignore the site's stylesheet, so HTML mail keeps to inline `style` and the tags the sanitizer already allows.
   - Subjects stay plain text.

The Mail desk's typed-count confirmation stays. It then writes `broadcast` outbox rows instead of pretending to send.

## Until mail is on: what covers the gap

| Need | Covered by |
| --- | --- |
| Payment receipt | Stripe emails it (turn on in the Stripe Dashboard) |
| "You're registered" | The manage page after checkout: code, attendees, add-to-calendar, and "Bookmark this page" |
| School invoices | Stripe Invoicing emails them |
| Guardian consent | The teacher forwards each student's `/c/<token>` link from their own email |
| Questions and changes | The chapter contact line on the manage page |
| An urgent notice to attendees | A "Copy emails" button on the registrations desk, for BCC from an operator's own mail program. Keep this rare: personal-account blasts hurt deliverability, and one slip into To or CC exposes everyone's address |

## Switching it on (checklist)

1. **A mailbox people can reply to**, on the chapter's domain (for example `events@`). Google Workspace for Nonprofits is free for eligible 501(c)(3) organizations. Eligibility is checked through Google for Nonprofits.
2. **A sending provider.**
   - Resend: a simple API that works well on Vercel.
   - Postmark: separate transactional and broadcast streams, and strong deliverability.
   - Amazon SES is cheapest but takes more setup.

   The `Mailer` interface keeps the choice swappable.
3. **DNS in Cloudflare.** Send from a subdomain (for example `mail.scs-wisconsin-usa.org`) so bulk-mail reputation can't hurt the main mailbox. Add:
   - **SPF**
   - **DKIM** (the provider gives you the records)
   - **DMARC**: start with `p=none` and reports, then move to `quarantine`

   Gmail and Yahoo have required these for bulk senders since 2024.
4. **Host variables** (names in `.env.example`, values in Vercel only):
   - `MAIL_PROVIDER`
   - `RESEND_API_KEY` or `POSTMARK_SERVER_TOKEN`
   - `CRON_SECRET`
   - `MAIL_WEBHOOK_SECRET`

   From name, from address, and reply-to already live on `chapters` (Chapter → mailbox line).
5. **Bounces and complaints.** A provider webhook (`/api/mail/events`, signature checked) handles them:
   - bounce: adds to `persons.email_bounce_count`
   - hard bounce: stops sending to that address
   - spam complaint: sets `email_unsubscribed`
6. **Unsubscribe.**
   - `{{unsubscribe_url}}` becomes `/u/<token>`: one page, one button, and it takes effect immediately.
   - Broadcast mail also carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers.
   - Transactional mail doesn't need an unsubscribe link.
7. **CAN-SPAM for broadcast.** A postal address in the footer (a PO box is fine), honest subject lines, and unsubscribes honored.
8. **Test.** Send one of each template to yourself. In Gmail, "Show original" should report SPF, DKIM, and DMARC as `PASS`.
9. **Release the held confirmations.**

## After mail is on

- **"Find my registration."** A page where someone types their email and gets their manage link by email. The page always answers "If we have a registration for that address, we've sent the link," so it never reveals who is registered.
- **Reminders:** 7 days and 1 day before, with parking and schedule.
- **Waitlist offers** that expire.
- **Thank-you and survey** after the conference.
- **SMS** comes last. It needs separate written consent and STOP handling (TCPA), kept apart from email consent.
