import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MERGE_FIELDS,
  affiliationPlan,
  defaultPicks,
  differingFields,
  mergeParticipation,
  mergePersonFields,
} from "./person-merge.ts";

const TODAY = "2026-10-16";

function person(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    notes: "",
    email_unsubscribed: false,
    email_bounce_count: 0,
    news_consent: "unknown",
    news_consent_at: null,
    last_touch_at: null,
    created_at: "2024-06-01T00:00:00.000Z",
    source: "manual",
    created_by: "keeper",
  };
  for (const field of MERGE_FIELDS) row[field.field] = "";
  row.status = "active";
  return { ...row, ...overrides };
}

describe("MERGE_FIELDS", () => {
  it("lists each choosable field once, with a label", () => {
    const names = MERGE_FIELDS.map((field) => field.field);
    assert.equal(new Set(names).size, names.length);
    assert.deepEqual(names, [
      "religious_title",
      "academic_title",
      "given_name",
      "middle_name",
      "middle_initial",
      "family_name",
      "suffix",
      "post_nominals",
      "salutation_override",
      "email",
      "phone",
      "mobile",
      "street",
      "street2",
      "city",
      "state",
      "postal_code",
      "country",
      "website",
      "dietary",
      "status",
      "deceased_on",
    ]);
    for (const field of MERGE_FIELDS) assert.ok(field.label.trim());
  });
});

describe("differingFields", () => {
  it("ignores blanks, nulls, and email case", () => {
    const keep = person({
      email: " Ada@Example.com ",
      city: "Madison",
      phone: " ",
      given_name: null,
    });
    const other = person({
      email: "ada@example.com",
      city: "Milwaukee",
      phone: null,
      given_name: "",
      family_name: "Example",
    });
    assert.deepEqual(differingFields(keep, other), ["family_name", "city"]);
  });

  it("reports a real email difference in field order", () => {
    const fields = differingFields(
      person({ email: "ada@example.com", status: "active", deceased_on: "" }),
      person({ email: "ben@example.com", status: "inactive", deceased_on: "2020-01-02" }),
    );
    assert.deepEqual(fields, ["email", "status", "deceased_on"]);
  });
});

describe("defaultPicks", () => {
  it("keeps a filled value and fills a blank from the other record", () => {
    const picks = defaultPicks(
      person({ given_name: "Ada", email: "", city: "Madison" }),
      person({ given_name: "Ben", email: "ben@example.com", city: "Milwaukee" }),
    );
    assert.equal(picks.given_name, "keep");
    assert.equal(picks.city, "keep");
    assert.equal(picks.email, "other");
    assert.equal(picks.family_name, "keep");
  });

  it("gives status and died-on to the only deceased record", () => {
    const otherDied = defaultPicks(
      person({ status: "active", deceased_on: "2020-01-01", email: "ada@example.com" }),
      person({ status: "deceased", deceased_on: "", email: "ben@example.com" }),
    );
    assert.equal(otherDied.status, "other");
    assert.equal(otherDied.deceased_on, "other");
    assert.equal(otherDied.email, "keep");

    const keepDied = defaultPicks(
      person({ status: "deceased", deceased_on: "" }),
      person({ status: "active", deceased_on: "2020-01-01" }),
    );
    assert.equal(keepDied.status, "keep");
    assert.equal(keepDied.deceased_on, "keep");
  });

  it("keeps the kept record when both are deceased", () => {
    const picks = defaultPicks(
      person({ status: "deceased", deceased_on: "" }),
      person({ status: "deceased", deceased_on: "2020-01-01" }),
    );
    assert.equal(picks.status, "keep");
    assert.equal(picks.deceased_on, "keep");
  });

  it("still fills died-on from the other record when neither is deceased", () => {
    const picks = defaultPicks(
      person({ status: "active", deceased_on: "" }),
      person({ status: "inactive", deceased_on: "2020-01-01" }),
    );
    assert.equal(picks.status, "keep");
    assert.equal(picks.deceased_on, "other");
  });
});

describe("mergePersonFields", () => {
  const keep = person({
    given_name: "Ada",
    family_name: "Example",
    email: "ada@example.com",
    notes: "Called in March",
    email_unsubscribed: false,
    email_bounce_count: 1,
    news_consent: "yes",
    news_consent_at: "2024-01-01T00:00:00.000Z",
    last_touch_at: "2024-02-01T00:00:00.000Z",
    created_at: "2024-06-01T00:00:00.000Z",
    source: "manual",
    created_by: "keeper",
  });
  const other = person({
    given_name: "Adele",
    family_name: "Sample",
    email: "Ben@Example.com",
    notes: "Met at the lecture",
    email_unsubscribed: true,
    email_bounce_count: 4,
    news_consent: "no",
    news_consent_at: "2025-03-01T00:00:00.000Z",
    last_touch_at: "2025-04-01T00:00:00.000Z",
    created_at: "2020-01-01T00:00:00.000Z",
    source: "import",
    created_by: "other-user",
  });

  it("takes each picked field and keeps source and created_by", () => {
    const picks = defaultPicks(keep, other);
    picks.given_name = "other";
    const merged = mergePersonFields(keep, other, picks, TODAY);
    assert.equal(merged.given_name, "Adele");
    assert.equal(merged.family_name, "Example");
    assert.equal(merged.email, "ada@example.com");
    assert.equal(merged.source, "manual");
    assert.equal(merged.created_by, "keeper");
  });

  it("keeps both notes and adds the other email on its own line", () => {
    const merged = mergePersonFields(keep, other, defaultPicks(keep, other), TODAY);
    assert.equal(
      merged.notes,
      "Called in March\n\nMet at the lecture\nOther email (merged 2026-10-16): Ben@Example.com",
    );
  });

  it("skips the email line when that email is the one being kept", () => {
    const picks = defaultPicks(keep, other);
    picks.email = "other";
    const merged = mergePersonFields(keep, other, picks, TODAY);
    assert.equal(merged.email, "Ben@Example.com");
    assert.equal(merged.notes, "Called in March\n\nMet at the lecture");
  });

  it("skips the email line when the addresses differ only by case", () => {
    const merged = mergePersonFields(
      person({ email: "ada@example.com", notes: "Called in March" }),
      person({ email: " Ada@Example.com ", notes: "Called in March" }),
      {},
      TODAY,
    );
    assert.equal(merged.notes, "Called in March");
  });

  it("adds only the email line when the other notes are blank", () => {
    const merged = mergePersonFields(
      person({ email: "ada@example.com", notes: "" }),
      person({ email: "ben@example.com", notes: " " }),
      {},
      TODAY,
    );
    assert.equal(merged.notes, "Other email (merged 2026-10-16): ben@example.com");
  });

  it("does not append the same notes or email line on a second pass", () => {
    const once = mergePersonFields(keep, other, {}, TODAY);
    const twice = mergePersonFields({ ...keep, notes: once.notes }, other, {}, TODAY);
    assert.equal(twice.notes, once.notes);
  });

  it("ors unsubscribe, takes the larger bounce count, and prefers no consent", () => {
    const merged = mergePersonFields(keep, other, {}, TODAY);
    assert.equal(merged.email_unsubscribed, true);
    assert.equal(merged.email_bounce_count, 4);
    assert.equal(merged.news_consent, "no");
    assert.equal(merged.news_consent_at, "2025-03-01T00:00:00.000Z");
  });

  it("uses yes consent when neither record said no", () => {
    const merged = mergePersonFields(
      person({ news_consent: "unknown", news_consent_at: null }),
      person({ news_consent: "yes", news_consent_at: "2025-03-01T00:00:00.000Z" }),
      {},
      TODAY,
    );
    assert.equal(merged.news_consent, "yes");
    assert.equal(merged.news_consent_at, "2025-03-01T00:00:00.000Z");
  });

  it("leaves consent unknown when neither record chose", () => {
    const merged = mergePersonFields(
      person({ news_consent: "", news_consent_at: null }),
      person({ news_consent: null, news_consent_at: "2025-03-01T00:00:00.000Z" }),
      {},
      TODAY,
    );
    assert.equal(merged.news_consent, "unknown");
    assert.equal(merged.news_consent_at, "2025-03-01T00:00:00.000Z");
  });

  it("keeps the later touch and the earlier created time, including ties", () => {
    const merged = mergePersonFields(keep, other, {}, TODAY);
    assert.equal(merged.last_touch_at, "2025-04-01T00:00:00.000Z");
    assert.equal(merged.created_at, "2020-01-01T00:00:00.000Z");
    const tie = mergePersonFields(
      person({ created_at: "2024-06-01T00:00:00.000Z", last_touch_at: "2024-02-01T00:00:00Z" }),
      person({ created_at: "2024-06-01T00:00:00.000Z", last_touch_at: "2024-02-01T00:00:00.000Z" }),
      {},
      TODAY,
    );
    assert.equal(tie.created_at, "2024-06-01T00:00:00.000Z");
    assert.equal(tie.last_touch_at, "2024-02-01T00:00:00Z");
  });
});

describe("mergeParticipation", () => {
  const rank = ["attended", "attending", "waitlisted", "declined", "no_show", "no_response"];

  it("picks the stronger guest status for every pair", () => {
    for (let i = 0; i < rank.length; i++) {
      for (let j = 0; j < rank.length; j++) {
        const merged = mergeParticipation({ guest_status: rank[i] }, { guest_status: rank[j] });
        const winner = i <= j ? rank[i] : rank[j];
        assert.equal(merged.guest_status, winner, `${rank[i]} vs ${rank[j]}`);
      }
    }
  });

  it("lets a known status beat a blank or unknown one", () => {
    assert.equal(
      mergeParticipation({ guest_status: "" }, { guest_status: "no_response" }).guest_status,
      "no_response",
    );
    assert.equal(
      mergeParticipation({ guest_status: "no_response" }, { guest_status: " " }).guest_status,
      "no_response",
    );
    assert.equal(
      mergeParticipation({ guest_status: "custom" }, { guest_status: "no_response" }).guest_status,
      "no_response",
    );
    assert.equal(
      mergeParticipation({ guest_status: "custom" }, { guest_status: "other" }).guest_status,
      "custom",
    );
    assert.equal(
      mergeParticipation({ guest_status: null }, { guest_status: "" }).guest_status,
      null,
    );
  });

  it("keeps the kept text unless it is blank", () => {
    const merged = mergeParticipation(
      {
        dietary_for_this_event: "fish",
        publicity_status: " ",
        registration_attendee_id: null,
      },
      {
        dietary_for_this_event: "nuts",
        publicity_status: "listed",
        registration_attendee_id: "att-2",
      },
    );
    assert.equal(merged.dietary_for_this_event, "fish");
    assert.equal(merged.publicity_status, "listed");
    assert.equal(merged.registration_attendee_id, "att-2");
  });

  it("combines notes once, takes the earlier check-in, and the larger party", () => {
    const once = mergeParticipation(
      {
        notes: "Door list",
        checked_in_at: "2026-04-16T18:00:00.000Z",
        party_size: 2,
      },
      {
        notes: "Brought a guest",
        checked_in_at: "2026-04-16T17:30:00.000Z",
        party_size: "5",
      },
    );
    assert.equal(once.notes, "Door list\n\nBrought a guest");
    assert.equal(once.checked_in_at, "2026-04-16T17:30:00.000Z");
    assert.equal(once.party_size, 5);
    const twice = mergeParticipation({ ...once, notes: once.notes }, { notes: "Brought a guest" });
    assert.equal(twice.notes, once.notes);
  });

  it("uses a check-in and a party size that only the other row has", () => {
    const merged = mergeParticipation(
      { checked_in_at: null, party_size: null },
      { checked_in_at: "2026-04-16T17:30:00.000Z", party_size: 3 },
    );
    assert.equal(merged.checked_in_at, "2026-04-16T17:30:00.000Z");
    assert.equal(merged.party_size, 3);
  });

  it("comes to mass, dinner, or the lecture if either row does", () => {
    const merged = mergeParticipation(
      { coming_to_mass: false, coming_to_dinner: null, coming_to_lecture: true },
      { coming_to_mass: true, coming_to_dinner: false, coming_to_lecture: false },
    );
    assert.equal(merged.coming_to_mass, true);
    assert.equal(merged.coming_to_dinner, false);
    assert.equal(merged.coming_to_lecture, true);
  });
});

describe("affiliationPlan", () => {
  const keep = new Map<string, string[]>([["org-1", ["pastor"]]]);

  it("drops a current office the kept person already holds", () => {
    assert.equal(
      affiliationPlan({ organizationId: "org-1", roleKey: "pastor", isCurrent: true }, keep),
      "drop",
    );
  });

  it("keeps a different current office as past", () => {
    assert.equal(
      affiliationPlan({ organizationId: "org-1", roleKey: "chaplain", isCurrent: true }, keep),
      "move_as_past",
    );
  });

  it("moves a current office at an organization the kept person is not at", () => {
    assert.equal(
      affiliationPlan({ organizationId: "org-2", roleKey: "pastor", isCurrent: true }, keep),
      "move",
    );
  });

  it("moves a past office even when the role matches", () => {
    assert.equal(
      affiliationPlan({ organizationId: "org-1", roleKey: "pastor", isCurrent: false }, keep),
      "move",
    );
  });

  it("moves when the kept person has no current offices", () => {
    assert.equal(
      affiliationPlan({ organizationId: "org-1", roleKey: "pastor", isCurrent: true }, new Map()),
      "move",
    );
  });
});
