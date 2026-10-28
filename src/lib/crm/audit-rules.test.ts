import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDIT_ACTIONS,
  AUDIT_GROUPS,
  actionsInGroup,
  auditHref,
  auditSummary,
  changedFields,
  safeDetail,
} from "./audit-rules.ts";

describe("AUDIT_GROUPS", () => {
  it("names the activity filters", () => {
    assert.deepEqual(AUDIT_GROUPS, [
      "operators",
      "website",
      "registration",
      "exports",
      "mail",
      "chapter",
      "people",
    ]);
  });
});

describe("AUDIT_ACTIONS", () => {
  it("labels every recorded action and keeps it in one group", () => {
    const required = [
      "operator_invited",
      "invite_revoked",
      "invite_accepted",
      "role_changed",
      "operator_disabled",
      "operator_restored",
      "reset_link_created",
      "account_removed",
      "password_reset_used",
      "site_item_created",
      "site_item_published",
      "site_item_unpublished",
      "site_item_saved",
      "site_item_removed",
      "site_settings_saved",
      "conference_copy_saved",
      "conference_venue_saved",
      "conference_speaker_added",
      "conference_speaker_saved",
      "conference_speaker_removed",
      "conference_session_added",
      "conference_session_saved",
      "conference_session_removed",
      "event_web_page_set",
      "registration_setup_saved",
      "registration_created",
      "registration_switch",
      "registration_cancelled",
      "registration_marked_paid",
      "registration_refunded",
      "attendee_cancelled",
      "attendee_renamed",
      "confirmation_viewed",
      "consent_received",
      "consent_details_purged",
      "export",
      "mailing_sent",
      "chapter_saved",
      "list_item_removed",
      "person_merged",
      "email_added",
      "email_removed",
      "email_made_main",
      "segment_saved",
      "segment_deleted",
      "person_forgotten",
      "people_imported",
      "safe_env_saved",
    ];
    for (const action of required) {
      const meta = AUDIT_ACTIONS[action];
      assert.ok(meta, action);
      assert.equal(meta.label.length > 0, true);
      assert.equal(AUDIT_GROUPS.includes(meta.group), true);
    }
    assert.deepEqual(actionsInGroup("exports"), ["export"]);
    assert.equal(actionsInGroup("operators").includes("role_changed"), true);
    assert.equal(actionsInGroup("mail").includes("export"), false);
    assert.deepEqual(actionsInGroup("people"), [
      "person_merged",
      "email_added",
      "email_removed",
      "email_made_main",
      "segment_saved",
      "segment_deleted",
      "person_forgotten",
      "people_imported",
      "safe_env_saved",
    ]);
    assert.equal(actionsInGroup("chapter").includes("person_merged"), false);
  });
});

describe("changedFields", () => {
  it("keeps field order and treats blank and null as the same", () => {
    const changed = changedFields(
      { title: "Old", summary: null, body: " same " },
      { title: "New", summary: "", body: " same " },
      ["body", "summary", "title"],
    );
    assert.deepEqual(changed, ["title"]);
  });

  it("compares dates by instant", () => {
    const changed = changedFields(
      { starts_at: new Date("2026-10-13T15:00:00.000Z"), ends_at: new Date("2026-10-13T16:00:00.000Z") },
      { starts_at: new Date("2026-10-13T15:00:00.000Z"), ends_at: new Date("2026-10-13T17:00:00.000Z") },
      ["starts_at", "ends_at"],
    );
    assert.deepEqual(changed, ["ends_at"]);
  });
});

describe("safeDetail", () => {
  it("drops token, manage link, and html keys and keeps the rest", () => {
    const cleaned = safeDetail({
      code: "AB12",
      title: "Gold Mass",
      token: "secret-token",
      token_hash: "abc",
      manageLink: "https://example.com/r/secret",
      manage_url: "https://example.com/r/secret",
      html: "<p>Hello</p>",
      body: "The whole letter",
      password: "hunter2",
      changed: ["title", "body"],
    });
    assert.deepEqual(cleaned, { code: "AB12", title: "Gold Mass", changed: ["title", "body"] });
  });

  it("returns an empty object for nothing", () => {
    assert.deepEqual(safeDetail(null), {});
  });
});

describe("auditSummary", () => {
  it("describes roles, field names, exports, and mail", () => {
    assert.equal(auditSummary("role_changed", { from: "editor", to: "admin" }), "editor → admin");
    assert.equal(auditSummary("site_item_saved", { changed: ["title", "summary"] }), "changed: title, summary");
    assert.equal(auditSummary("export", { kind: "nametags", rows: 12 }), "12 rows");
    assert.equal(auditSummary("mailing_sent", { recipients: 3, skipped: 1 }), "3 recipients, 1 skipped");
    assert.equal(auditSummary("password_reset_used", {}), "");
    assert.equal(auditSummary("not_a_real_action", { token: "nope" }), "");
  });

  it("names both people when two records are merged", () => {
    assert.equal(
      auditSummary("person_merged", { mergedName: "Ben Example", keptName: "Ada Example" }),
      "Ben Example → Ada Example",
    );
    assert.equal(auditSummary("segment_saved", { name: "Teachers" }), "Teachers");
    assert.equal(auditSummary("segment_deleted", { name: "Teachers" }), "Teachers");
    assert.equal(auditSummary("person_forgotten", { on: "2026-10-18" }), "2026-10-18");
    assert.equal(
      auditSummary("people_imported", { created: 2, tasks: 1, skipped: 3 }),
      "2 created, 1 tasks",
    );
    assert.equal(
      auditSummary("safe_env_saved", { changed: ["works_with_minors", "safe_env_trained_on"] }),
      "changed: works_with_minors, safe_env_trained_on",
    );
  });

  it("shows the address when an other email is added or removed", () => {
    assert.equal(
      auditSummary("email_added", { email: "ada.work@example.com", label: "work" }),
      "ada.work@example.com",
    );
    assert.equal(auditSummary("email_removed", { email: "ada.work@example.com" }), "ada.work@example.com");
    assert.equal(
      auditSummary("email_made_main", { from: "ada@example.com", to: "ada.work@example.com" }),
      "ada@example.com → ada.work@example.com",
    );
  });

  it("names the registration code and how consent was received", () => {
    assert.equal(auditSummary("registration_marked_paid", { code: "R27-ABCD", amountCents: 2500 }), "R27-ABCD, 2500");
    assert.equal(auditSummary("registration_refunded", { code: "R27-ABCD", amountCents: 2500 }), "R27-ABCD, 2500");
    assert.equal(auditSummary("consent_received", { code: "R27-ABCD", method: "paper" }), "R27-ABCD, paper");
    assert.equal(auditSummary("consent_details_purged", { rows: 4 }), "4 rows");
  });
});

describe("auditHref", () => {
  it("points at the desk for the entity, and nowhere for a removed website item", () => {
    assert.equal(auditHref("event", "evt-1", {}), "/events/evt-1");
    assert.equal(
      auditHref("registration", "reg-1", { eventId: "evt-1" }),
      "/events/evt-1/registrations",
    );
    assert.equal(auditHref("registration_attendee", "att-1", {}), null);
    assert.equal(auditHref("site_item", "item-1", {}, "site_item_saved"), "/website?item=item-1");
    assert.equal(auditHref("site_item", "item-1", { title: "Gone" }, "site_item_removed"), null);
    assert.equal(auditHref("mailing", "mail-1", {}), "/mail/mail-1");
    assert.equal(auditHref("operator", "user-1", {}), "/chapter");
    assert.equal(auditHref("chapter", "chapter-1", {}), "/chapter");
    assert.equal(auditHref("person", "per-1", {}), "/people/per-1");
  });
});
