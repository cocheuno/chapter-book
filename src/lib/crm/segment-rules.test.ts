import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSegmentFilter, segmentWhere } from "./segment-rules.ts";

const defaults = {
  roles: [] as string[],
  tagIds: [] as string[],
  partnerTypes: [] as string[],
  city: "",
  state: "",
  attendedEventId: "",
  excludeUnsubscribed: true,
  excludeDoNotContact: true,
  excludeDeceased: true,
};

const baseSql =
  "where p.chapter_id = $1 and p.forgotten_at is null and p.email_unsubscribed = false and p.status <> 'do_not_contact' and p.status <> 'deceased'";

describe("parseSegmentFilter", () => {
  it("fills empty lists and turns the three excludes on", () => {
    assert.deepEqual(parseSegmentFilter({}), defaults);
    assert.deepEqual(parseSegmentFilter(undefined), defaults);
    assert.deepEqual(
      parseSegmentFilter('{"city":" Northtown ","excludeDeceased":false,"extra":1}'),
      { ...defaults, city: "Northtown", excludeDeceased: false },
    );
  });

  it("trims list values and drops blanks", () => {
    assert.deepEqual(parseSegmentFilter({ roles: [" educator ", ""], tagIds: [" tag-1 "] }).roles, [
      "educator",
    ]);
    assert.deepEqual(parseSegmentFilter({ roles: [" educator ", ""] }).tagIds, []);
    assert.deepEqual(parseSegmentFilter({ tagIds: [" tag-1 "] }).tagIds, ["tag-1"]);
  });

  it("rejects a list over 50 or a string over 100", () => {
    const tooMany = Array.from({ length: 51 }, (_, index) => "role-" + String(index));
    assert.throws(() => parseSegmentFilter({ roles: tooMany }));
    assert.throws(() => parseSegmentFilter({ city: "n".repeat(101) }));
    assert.deepEqual(parseSegmentFilter({ city: "n".repeat(100) }).city, "n".repeat(100));
  });
});

describe("segmentWhere", () => {
  it("limits the chapter and applies the three excludes", () => {
    const result = segmentWhere(parseSegmentFilter({}));
    assert.equal(result.sql, baseSql);
    assert.deepEqual(result.params, []);
    assert.equal(result.sql.includes(";"), false);
  });

  it("adds a role, tag, or partner-type match", () => {
    const roles = segmentWhere(parseSegmentFilter({ roles: ["educator", "student"] }));
    assert.equal(
      roles.sql,
      "where p.chapter_id = $1 and p.forgotten_at is null and exists (select 1 from person_roles r where r.person_id = p.id and r.role_key = any($2::text[])) and p.email_unsubscribed = false and p.status <> 'do_not_contact' and p.status <> 'deceased'",
    );
    assert.deepEqual(roles.params, [["educator", "student"]]);

    const tags = segmentWhere(parseSegmentFilter({ tagIds: ["tag-1"] }));
    assert.equal(tags.sql.includes("from person_tags pt"), true);
    assert.equal(tags.sql.includes("tg.chapter_id = p.chapter_id"), true);
    assert.equal(tags.sql.includes("pt.tag_id = any($2::text[])"), true);
    assert.deepEqual(tags.params, [["tag-1"]]);

    const partners = segmentWhere(parseSegmentFilter({ partnerTypes: ["parish"] }));
    assert.equal(partners.sql.includes("from affiliations a"), true);
    assert.equal(partners.sql.includes("join organizations o"), true);
    assert.equal(partners.sql.includes("o.chapter_id = a.chapter_id"), true);
    assert.equal(partners.sql.includes("o.type_key = any($2::text[])"), true);
    assert.deepEqual(partners.params, [["parish"]]);
  });

  it("compares city and state without putting the text in the SQL", () => {
    const tricky = "northtown' or 1=1";
    const city = segmentWhere(parseSegmentFilter({ city: tricky }));
    assert.equal(city.sql.includes("lower(p.city) = lower($2)"), true);
    assert.equal(city.sql.includes(tricky), false);
    assert.deepEqual(city.params, [tricky]);

    const state = segmentWhere(parseSegmentFilter({ state: "EX" }));
    assert.equal(state.sql.includes("lower(p.state) = lower($2)"), true);
    assert.equal(state.sql.includes("EX"), false);
    assert.deepEqual(state.params, ["EX"]);
  });

  it("matches an attended person-party row for one event", () => {
    const result = segmentWhere(parseSegmentFilter({ attendedEventId: "evt-1" }));
    assert.equal(result.sql.includes("from participations part"), true);
    assert.equal(result.sql.includes("e.chapter_id = part.chapter_id"), true);
    assert.equal(result.sql.includes("part.event_id = $2"), true);
    assert.equal(result.sql.includes("part.party_type = 'person'"), true);
    assert.equal(
      result.sql.includes("part.guest_status = 'attended' or part.checked_in_at is not null"),
      true,
    );
    assert.equal(result.sql.includes("evt-1"), false);
    assert.deepEqual(result.params, ["evt-1"]);
  });

  it("omits an exclude when that box is off", () => {
    const unsubscribed = segmentWhere(parseSegmentFilter({ excludeUnsubscribed: false }));
    assert.equal(unsubscribed.sql.includes("email_unsubscribed"), false);
    assert.equal(unsubscribed.sql.includes("do_not_contact"), true);
    assert.equal(unsubscribed.sql.includes("deceased"), true);

    const contact = segmentWhere(parseSegmentFilter({ excludeDoNotContact: false }));
    assert.equal(contact.sql.includes("do_not_contact"), false);
    assert.equal(contact.sql.includes("email_unsubscribed"), true);

    const deceased = segmentWhere(parseSegmentFilter({ excludeDeceased: false }));
    assert.equal(deceased.sql.includes("<> 'deceased'"), false);
    assert.equal(deceased.sql.includes("do_not_contact"), true);

    const open = segmentWhere(
      parseSegmentFilter({
        excludeUnsubscribed: false,
        excludeDoNotContact: false,
        excludeDeceased: false,
      }),
    );
    assert.equal(open.sql, "where p.chapter_id = $1 and p.forgotten_at is null");
    assert.deepEqual(open.params, []);
  });

  it("combines every condition and shifts placeholders with the chapter slot", () => {
    const filter = parseSegmentFilter({
      roles: ["friend"],
      tagIds: ["tag-1", "tag-2"],
      partnerTypes: ["university"],
      city: "Northtown",
      state: "EX",
      attendedEventId: "evt-9",
    });
    const result = segmentWhere(filter, 4);
    assert.equal(result.sql.startsWith("where p.chapter_id = $4 and "), true);
    assert.equal(result.sql.includes("r.role_key = any($5::text[])"), true);
    assert.equal(result.sql.includes("pt.tag_id = any($6::text[])"), true);
    assert.equal(result.sql.includes("o.type_key = any($7::text[])"), true);
    assert.equal(result.sql.includes("lower(p.city) = lower($8)"), true);
    assert.equal(result.sql.includes("lower(p.state) = lower($9)"), true);
    assert.equal(result.sql.includes("part.event_id = $10"), true);
    assert.equal(result.sql.endsWith("and p.email_unsubscribed = false and p.status <> 'do_not_contact' and p.status <> 'deceased'"), true);
    assert.deepEqual(result.params, [["friend"], ["tag-1", "tag-2"], ["university"], "Northtown", "EX", "evt-9"]);
    assert.equal(result.sql.includes("Northtown"), false);
    assert.equal(result.sql.includes("evt-9"), false);
    assert.equal(result.sql.includes(";"), false);
  });
});
