import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "./ids";
import { GOLD_MASS_CHECKLIST } from "./constants";
import { MAIL_TEMPLATE_SEEDS } from "./templates";
import { ensureLists, seedLists } from "./lists";
import { ensureSite } from "./site-seed";

export type ChapterRole = "admin" | "editor" | "viewer";

export type MemberContext = {
  userId: string;
  chapterId: string;
  role: ChapterRole;
  chapterName: string;
  timezone: string;
  contactLine: string | null;
  fromName: string;
  fromAddress: string | null;
  replyTo: string | null;
};

export function assertEditor(role: ChapterRole) {
  if (role === "viewer") {
    throw new Error("Viewers can look, not edit.");
  }
}

export function assertAdmin(role: ChapterRole) {
  if (role !== "admin") {
    throw new Error("Only an admin can do that.");
  }
}

export async function loadMember(userId: string): Promise<MemberContext> {
  const sql = await getSql();
  const existing = await sql<{
    user_id: string;
    chapter_id: string;
    role: ChapterRole;
    name: string;
    timezone: string;
    contact_line: string | null;
    from_name: string;
    from_address: string | null;
    reply_to: string | null;
  }>`
    select m.user_id, m.chapter_id, m.role, c.name, c.timezone, c.contact_line,
           c.from_name, c.from_address, c.reply_to
    from chapter_members m
    join chapters c on c.id = m.chapter_id
    where m.user_id = ${userId}
  `;
  if (existing[0]) {
    const r = existing[0];
    await ensureLists(sql, r.chapter_id);
    await ensureSite(sql, r.chapter_id);
    return {
      userId,
      chapterId: r.chapter_id,
      role: r.role,
      chapterName: r.name,
      timezone: r.timezone,
      contactLine: r.contact_line,
      fromName: r.from_name,
      fromAddress: r.from_address,
      replyTo: r.reply_to,
    };
  }

  const chapters = await sql<{ id: string; name: string }>`select id, name from chapters limit 1`;
  if (chapters[0]) {
    await sql`
      insert into chapter_members (user_id, chapter_id, role)
      values (${userId}, ${chapters[0].id}, 'editor')
    `;
    return loadMember(userId);
  }

  await bootstrapChapter(userId);
  return loadMember(userId);
}

async function bootstrapChapter(userId: string) {
  const sql = await getSql();
  const chapterId = nid();
  await sql`
    insert into chapters (id, name, timezone, contact_line, from_name, from_address, reply_to)
    values (
      ${chapterId},
      ${"SCS Chapter"},
      ${"America/Denver"},
      ${"chapter@catholicscientists.example"},
      ${"SCS Chapter"},
      ${"chapter@catholicscientists.example"},
      ${"chapter@catholicscientists.example"}
    )
  `;
  await sql`
    insert into chapter_members (user_id, chapter_id, role)
    values (${userId}, ${chapterId}, 'admin')
  `;
  await seedLists(sql, chapterId);

  for (const t of MAIL_TEMPLATE_SEEDS) {
    await sql`
      insert into mail_templates (id, chapter_id, key, name, audience_hint, subject, body, event_type_key)
      values (
        ${nid()}, ${chapterId}, ${t.key}, ${t.name}, ${t.audienceHint},
        ${t.subject}, ${t.body}, ${t.eventTypeKey}
      )
    `;
  }

  const dioceseId = nid();
  const stMaryId = nid();
  const ignatiusId = nid();
  const anneId = nid();
  const jamesId = nid();
  const annId = nid();
  const patriciaId = nid();
  const elenaId = nid();
  const bishopId = nid();
  const eventId = nid();

  await sql`
    insert into organizations (id, chapter_id, name, type_key, city, state, country, is_venue, is_invitation_partner, chancery_city)
    values (${dioceseId}, ${chapterId}, ${"Diocese of Santa Fe"}, ${"diocese"}, ${"Santa Fe"}, ${"New Mexico"}, ${"United States"}, false, true, ${"Santa Fe"})
  `;
  await sql`
    insert into organizations (
      id, chapter_id, name, type_key, parent_id, city, state, country, main_email, main_phone,
      is_venue, is_invitation_partner, capacity_church, capacity_hall,
      typical_mass_times, bulletin_deadline, hall_notes, parking_notes
    ) values (
      ${stMaryId}, ${chapterId}, ${"St. Mary’s Parish"}, ${"parish"}, ${dioceseId},
      ${"Albuquerque"}, ${"New Mexico"}, ${"United States"}, ${"office@stmarys.example"}, ${"505-555-0140"},
      true, true, 400, 120,
      ${"Sun 9 & 11; vigil 5"}, ${"Tuesday noon"},
      ${"Kitchen yes; book through parish secretary."},
      ${"Street + school lot after 5pm"}
    )
  `;
  await sql`
    insert into organizations (
      id, chapter_id, name, type_key, parent_id, city, state, country, main_email, main_phone,
      is_venue, is_invitation_partner, preferred_door, science_dept_notes, can_bus_students
    )
    values
      (${ignatiusId}, ${chapterId}, ${"St. Ignatius High School"}, ${"high_school"}, ${dioceseId}, ${"Albuquerque"}, ${"New Mexico"}, ${"United States"}, ${"info@stignatius.example"}, ${"505-555-0188"}, false, true, ${"science_chair"}, ${"4 faculty; AP Bio and Physics"}, ${"yes"}),
      (${anneId}, ${chapterId}, ${"St. Anne’s High School"}, ${"high_school"}, ${dioceseId}, ${"Santa Fe"}, ${"New Mexico"}, ${"United States"}, ${"office@stanneshs.example"}, ${"505-555-0191"}, false, true, ${"science_chair"}, ${"No chair on file yet."}, ${"unknown"})
  `;

  await sql`
    insert into persons (
      id, chapter_id, display_name, given_name, family_name, honorific, religious_title, academic_title,
      email, phone, city, state, country, notes, created_by
    )
    values
      (${jamesId}, ${chapterId}, ${"Fr. James O’Neill"}, ${"James"}, ${"O’Neill"}, ${"Fr."}, ${"Fr."}, null, ${"j.oneill@stmarys.example"}, ${"505-555-0141"}, ${"Albuquerque"}, ${"New Mexico"}, ${"United States"}, ${"Prefers weekday evening Mass."}, ${userId}),
      (${annId}, ${chapterId}, ${"Ann Cole"}, ${"Ann"}, ${"Cole"}, null, null, null, ${"a.cole@stmarys.example"}, ${"505-555-0142"}, ${"Albuquerque"}, ${"New Mexico"}, ${"United States"}, ${"Parish secretary; bulletin contact."}, ${userId}),
      (${patriciaId}, ${chapterId}, ${"Sr. Patricia Reyes"}, ${"Patricia"}, ${"Reyes"}, ${"Sr."}, ${"Sr."}, null, ${"p.reyes@stignatius.example"}, ${"505-555-0189"}, ${"Albuquerque"}, ${"New Mexico"}, ${"United States"}, ${"Science chair; willing to bring students."}, ${userId}),
      (${elenaId}, ${chapterId}, ${"Dr. Elena Ruiz"}, ${"Elena"}, ${"Ruiz"}, ${"Dr."}, null, ${"Dr."}, ${"elena.ruiz@stateu.example"}, ${"505-555-0210"}, ${"Albuquerque"}, ${"New Mexico"}, ${"United States"}, ${"Biochem; spoke last year."}, ${userId}),
      (${bishopId}, ${chapterId}, ${"Most Rev. John Hale"}, ${"John"}, ${"Hale"}, ${"Most Rev."}, ${"Most Rev."}, null, ${"bishop@diocesesf.example"}, null, ${"Santa Fe"}, ${"New Mexico"}, ${"United States"}, null, ${userId})
  `;

  const roles: [string, string][] = [
    [jamesId, "clergy"],
    [annId, "friend"],
    [patriciaId, "educator"],
    [elenaId, "academic_member"],
    [elenaId, "speaker"],
    [bishopId, "clergy"],
  ];
  for (const [pid, role] of roles) {
    await sql`insert into person_roles (person_id, role_key) values (${pid}, ${role})`;
  }

  const aff = [
    [nid(), jamesId, stMaryId, "pastor", true],
    [nid(), annId, stMaryId, "parish_secretary", false],
    [nid(), patriciaId, ignatiusId, "science_chair", true],
    [nid(), bishopId, dioceseId, "bishop", true],
  ] as const;
  for (const a of aff) {
    await sql`
      insert into affiliations (id, chapter_id, person_id, target_type, organization_id, role_key, is_primary, is_current)
      values (${a[0]}, ${chapterId}, ${a[1]}, ${"organization"}, ${a[2]}, ${a[3]}, ${a[4]}, true)
    `;
  }

  const starts = "2026-11-15T17:30:00-07:00";
  await sql`
    insert into events (
      id, chapter_id, type_key, title, status, starts_at, timezone,
      venue_organization_id, venue_detail, celebrant_id, summary
    ) values (
      ${eventId}, ${chapterId}, ${"gold_mass"},
      ${"Gold Mass of St. Albert the Great, 2026"},
      ${"planning"}, ${starts}, ${"America/Denver"},
      ${stMaryId}, ${"Main church"}, ${bishopId},
      ${"Votive Mass of St. Albert the Great, with lecture and reception in the hall."}
    )
  `;
  await sql`
    insert into event_slots (event_id, slot_key, text_value, organization_id, person_id)
    values
      (${eventId}, ${"liturgical_occasion"}, ${"st_albert"}, null, null),
      (${eventId}, ${"host_parish"}, null, ${stMaryId}, null),
      (${eventId}, ${"homilist"}, null, null, ${bishopId}),
      (${eventId}, ${"intended_audience"}, ${"Scientists, HS teachers, advanced students in the diocese"}, null, null)
  `;
  await sql`
    insert into program_pieces (id, event_id, kind_key, title, location, speaker_person_id, sort_order)
    values
      (${nid()}, ${eventId}, ${"lecture"}, ${"Faith and Reason in the Laboratory"}, ${"Parish hall"}, ${elenaId}, 1),
      (${nid()}, ${eventId}, ${"reception"}, ${"Reception"}, ${"Parish hall"}, null, 2)
  `;

  const startDate = new Date("2026-11-15T17:30:00-07:00");
  for (const item of GOLD_MASS_CHECKLIST) {
    const due = new Date(startDate);
    due.setDate(due.getDate() + item.offsetDays);
    const dueStr = due.toISOString().slice(0, 10);
    const status = ["choose_date", "request_pastor"].includes(item.key) ? "done" : "open";
    await sql`
      insert into tasks (id, chapter_id, title, due_on, status, event_id, checklist_key, hat)
      values (${nid()}, ${chapterId}, ${item.title}, ${dueStr}, ${status}, ${eventId}, ${item.key}, ${item.hat})
    `;
  }

  await sql`
    insert into participations (id, chapter_id, event_id, party_type, person_id, organization_id, kind_key, guest_status, source, dietary_for_this_event, party_size)
    values
      (${nid()}, ${chapterId}, ${eventId}, ${"person"}, ${elenaId}, null, ${"guest"}, ${"attending"}, ${"invite"}, ${"vegetarian"}, 1),
      (${nid()}, ${chapterId}, ${eventId}, ${"person"}, ${jamesId}, null, ${"guest"}, ${"attending"}, ${"invite"}, null, 1),
      (${nid()}, ${chapterId}, ${eventId}, ${"person"}, ${patriciaId}, ${ignatiusId}, ${"group_lead"}, ${"no_response"}, ${"invite"}, null, 12)
  `;
  await sql`
    insert into participations (id, chapter_id, event_id, party_type, organization_id, kind_key, publicity_status, source)
    values
      (${nid()}, ${chapterId}, ${eventId}, ${"organization"}, ${ignatiusId}, ${"org_publicity"}, ${"asked"}, ${"invite"}),
      (${nid()}, ${chapterId}, ${eventId}, ${"organization"}, ${anneId}, ${"org_publicity"}, ${"asked"}, ${"invite"}),
      (${nid()}, ${chapterId}, ${eventId}, ${"organization"}, ${stMaryId}, ${"org_publicity"}, ${"will_announce"}, ${"invite"})
  `;

  await sql`
    insert into touches (id, chapter_id, person_id, organization_id, kind, summary, event_id, author_id)
    values (
      ${nid()}, ${chapterId}, ${jamesId}, ${stMaryId}, ${"call"},
      ${"Spoke after the 9am. Hall is free in November."}, ${eventId}, ${userId}
    )
  `;
  await sql`update persons set last_touch_at = now() where id = ${jamesId}`;
  await sql`update organizations set last_touch_at = now() where id = ${stMaryId}`;
  await ensureSite(sql, chapterId);
}

export const getSessionContext = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => loadMember(context.userId));
