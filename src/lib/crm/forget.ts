import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, withTransaction } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { recordAudit } from "./audit";
import { todayIn } from "./dates";
import { forgottenLabel, nameMatches } from "./forget-rules";
import { assertAdmin, loadMember } from "./member";

const REMOVED_ADDRESS = "removed@example.invalid";

export const forgetPerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      personId: z.string().min(1),
      typedName: z.string(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertAdmin(member.role);
    const sql = await getSql();
    const found = await sql<{ id: string; display_name: string }>`
      select id, display_name from persons
      where id = ${data.personId} and chapter_id = ${member.chapterId}
    `;
    const person = found[0];
    if (!person) throw new Error("Person not found.");
    if (!nameMatches(data.typedName, person.display_name)) {
      throw new Error("The name does not match.");
    }

    const personId = person.id;
    const chapterId = member.chapterId;
    const label = forgottenLabel(personId);

    return withTransaction(async (tx) => {
      const locked = await tx<{ id: string }>`
        select id from persons where id = ${personId} and chapter_id = ${chapterId} for update
      `;
      if (!locked[0]) throw new Error("Person not found.");

      const auditId = await recordAudit(tx, {
        chapterId,
        actor: member.userId,
        action: "person_forgotten",
        entity: "person",
        entityId: personId,
        detail: { on: todayIn(member.timezone) },
      });

      const addressRows = await tx<{ email: string }>`
        select lower(btrim(email)) as email
        from persons
        where id = ${personId} and chapter_id = ${chapterId}
          and email is not null and btrim(email) <> ''
        union
        select lower(btrim(email)) as email
        from person_emails
        where person_id = ${personId} and chapter_id = ${chapterId}
          and btrim(email) <> ''
      `;
      const addresses = [...new Set(addressRows.map((row) => row.email).filter((email) => email.length > 0))];

      await tx`
        delete from person_emails
        where person_id = ${personId} and chapter_id = ${chapterId}
      `;
      await tx`
        delete from person_tags
        where person_id = ${personId}
          and exists (
            select 1 from persons p
            where p.id = person_tags.person_id and p.chapter_id = ${chapterId}
          )
      `;
      await tx`
        delete from person_relationships
        where (person_id = ${personId} or related_person_id = ${personId})
          and exists (
            select 1 from persons p
            where p.id = ${personId} and p.chapter_id = ${chapterId}
          )
      `;
      await tx`
        delete from affiliations
        where person_id = ${personId} and chapter_id = ${chapterId}
      `;

      await tx`
        update touches
        set summary = 'Removed'
        where person_id = ${personId} and chapter_id = ${chapterId}
      `;
      await tx`
        update tasks
        set title = 'Removed', notes = null
        where person_id = ${personId} and chapter_id = ${chapterId}
      `;
      await tx`
        update participations
        set notes = null, dietary_for_this_event = null, guest_name = null
        where person_id = ${personId} and chapter_id = ${chapterId}
      `;
      const nameRows = await tx<{ full_name: string }>`
        select distinct given_name || ' ' || family_name as full_name
        from registration_attendees
        where person_id = ${personId} and chapter_id = ${chapterId}
      `;
      const attendeeNames = nameRows
        .map((row) => row.full_name)
        .filter((name) => name.trim().length > 0)
        .sort((left, right) => right.length - left.length);
      for (const fullName of attendeeNames) {
        await tx`
          update mail_outbox
          set text_body = replace(text_body, ${fullName}, 'Removed person'),
              html_body = case
                when html_body is null then null
                else replace(html_body, ${fullName}, 'Removed person')
              end
          where chapter_id = ${chapterId}
            and template_key = 'registration_confirmation'
            and registration_id in (
              select a.registration_id
              from registration_attendees a
              where a.person_id = ${personId} and a.chapter_id = ${chapterId}
            )
        `;
      }
      await tx`
        update registration_attendees
        set given_name = 'Removed',
            family_name = 'person',
            email = null,
            badge_affiliation = null,
            dietary = null,
            accessibility = null,
            review_changes = null,
            details = null,
            emergency_name = null,
            emergency_phone = null,
            grade = null,
            school_organization_id = null,
            consent_token_hash = null
        where person_id = ${personId} and chapter_id = ${chapterId}
      `;
      await tx`
        update audit_log
        set detail = '{"forgotten": true}'::jsonb
        where chapter_id = ${chapterId}
          and entity = 'registration_attendee'
          and entity_id in (
            select a.id from registration_attendees a
            where a.person_id = ${personId} and a.chapter_id = ${chapterId}
          )
      `;
      await tx`
        delete from guardian_consents
        where chapter_id = ${chapterId}
          and attendee_id in (
            select a.id from registration_attendees a
            where a.person_id = ${personId} and a.chapter_id = ${chapterId}
          )
      `;
      if (addresses.length > 0) {
        // guardian_phone is not null; a blank is the clear this package can store.
        await tx`
          update guardian_consents
          set guardian_name = 'Removed person',
              signed_name = 'Removed person',
              guardian_email = null,
              guardian_phone = '',
              relationship = null,
              emergency_name = null,
              emergency_phone = null,
              medical_notes = null,
              signed_ip = null
          where chapter_id = ${chapterId}
            and guardian_email is not null
            and lower(guardian_email) = any(${addresses}::text[])
        `;
      }
      await tx`
        update registrations
        set purchaser_name = 'Removed person',
            purchaser_email = ${REMOVED_ADDRESS},
            purchaser_phone = null,
            notes = null,
            heard_from = null,
            utm_source = null
        where purchaser_person_id = ${personId} and chapter_id = ${chapterId}
      `;
      await tx`
        update payments
        set note = null
        where chapter_id = ${chapterId}
          and registration_id in (
            select r.id from registrations r
            where r.purchaser_person_id = ${personId} and r.chapter_id = ${chapterId}
          )
      `;
      await tx`
        update mail_messages
        set address = ${REMOVED_ADDRESS}
        from mailings m
        where mail_messages.mailing_id = m.id
          and m.chapter_id = ${chapterId}
          and mail_messages.person_id = ${personId}
      `;
      await tx`
        update mail_outbox
        set to_address = ${REMOVED_ADDRESS},
            to_name = null,
            text_body = 'Removed',
            html_body = null,
            status = case when status = 'held' then 'cancelled' else status end
        where person_id = ${personId} and chapter_id = ${chapterId}
      `;

      await tx`
        update audit_log
        set detail = '{"forgotten": true}'::jsonb
        where chapter_id = ${chapterId}
          and entity = 'person'
          and entity_id = ${personId}
          and id <> ${auditId}
      `;

      await tx`
        delete from person_roles
        where person_id = ${personId}
          and exists (
            select 1 from persons p
            where p.id = person_roles.person_id and p.chapter_id = ${chapterId}
          )
      `;

      await tx`
        update persons
        set display_name = ${label},
            given_name = null,
            family_name = null,
            middle_name = null,
            middle_initial = null,
            suffix = null,
            honorific = null,
            religious_title = null,
            academic_title = null,
            post_nominals = null,
            salutation_override = null,
            email = null,
            phone = null,
            mobile = null,
            street = null,
            street2 = null,
            city = null,
            state = null,
            postal_code = null,
            country = null,
            website = null,
            dietary = null,
            notes = null,
            deceased_on = null,
            status = 'do_not_contact',
            email_unsubscribed = true,
            news_consent = 'no',
            works_with_minors = false,
            safe_env_program = null,
            safe_env_trained_on = null,
            safe_env_diocese = null,
            background_check_on = null,
            background_check_expires_on = null,
            suitability_requested_on = null,
            suitability_received_on = null,
            suitability_expires_on = null,
            forgotten_at = now()
        where id = ${personId} and chapter_id = ${chapterId}
      `;

      return { id: personId };
    });
  });
