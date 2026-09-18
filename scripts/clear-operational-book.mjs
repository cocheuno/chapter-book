#!/usr/bin/env node
/**
 * Remove demo people, partners, and gatherings from the chapter book.
 * Keeps operators, lists, mail templates, and website copy.
 * Requires DATABASE_URL. Does not print connection strings or member emails.
 */
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = new pg.Pool({ connectionString: url, max: 1 });

async function main() {
  const chapters = await sql.query("select id from chapters");
  if (chapters.rows.length === 0) {
    console.log("clear-operational-book: no chapter yet");
    return;
  }
  for (const { id } of chapters.rows) {
    const counts = await sql.query(
      `select
         (select count(*)::int from persons where chapter_id = $1) as people,
         (select count(*)::int from organizations where chapter_id = $1) as partners,
         (select count(*)::int from events where chapter_id = $1) as events`,
      [id],
    );
    const { people, partners, events } = counts.rows[0];
    await sql.query("begin");
    try {
      await sql.query(
        "delete from mailing_skips where mailing_id in (select id from mailings where chapter_id = $1)",
        [id],
      );
      await sql.query(
        "delete from mail_messages where mailing_id in (select id from mailings where chapter_id = $1)",
        [id],
      );
      await sql.query("delete from mailings where chapter_id = $1", [id]);
      await sql.query("delete from participations where chapter_id = $1", [id]);
      await sql.query(
        "delete from program_pieces where event_id in (select id from events where chapter_id = $1)",
        [id],
      );
      await sql.query(
        "delete from event_slots where event_id in (select id from events where chapter_id = $1)",
        [id],
      );
      await sql.query(
        "delete from event_sessions where event_id in (select id from events where chapter_id = $1)",
        [id],
      );
      await sql.query(
        `delete from event_links where event_id_a in (select id from events where chapter_id = $1)
          or event_id_b in (select id from events where chapter_id = $1)`,
        [id],
      );
      await sql.query("delete from tasks where chapter_id = $1", [id]);
      await sql.query("delete from touches where chapter_id = $1", [id]);
      await sql.query("delete from affiliations where chapter_id = $1", [id]);
      await sql.query(
        "delete from person_roles where person_id in (select id from persons where chapter_id = $1)",
        [id],
      );
      await sql.query(
        "update events set celebrant_id = null, venue_organization_id = null, cloned_from_id = null where chapter_id = $1",
        [id],
      );
      await sql.query("delete from events where chapter_id = $1", [id]);
      await sql.query("delete from persons where chapter_id = $1", [id]);
      await sql.query("update organizations set parent_id = null where chapter_id = $1", [id]);
      await sql.query("delete from organizations where chapter_id = $1", [id]);
      await sql.query("commit");
    } catch (err) {
      await sql.query("rollback");
      throw err;
    }
    console.log(`clear-operational-book: removed people=${people} partners=${partners} events=${events}`);
  }
}

main()
  .catch((err) => {
    console.error("clear-operational-book: failed");
    console.error(err instanceof Error ? err.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(() => sql.end());
