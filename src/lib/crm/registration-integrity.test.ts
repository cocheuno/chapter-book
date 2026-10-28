import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing start marker: ${start}`);
  assert.ok(to > from, `missing end marker: ${end}`);
  return source.slice(from, to);
}

describe("registration integrity", () => {
  it("creates a registration in one transaction and does not undo by hand", () => {
    const source = readFileSync(join(root, "src/lib/crm/registration-public.ts"), "utf8");
    const create = section(source, "export const createRegistration", "async function placeParticipation");
    assert.equal(create.includes("withTransaction"), true);
    assert.equal(source.includes("undos"), false);
    const body = create.slice(create.indexOf("withTransaction"));
    assert.equal(body.includes("getSql("), false);
  });

  it("cancels a registration and an attendee in one transaction", () => {
    const source = readFileSync(join(root, "src/lib/crm/registration-desk.ts"), "utf8");
    const attendee = section(source, "export const cancelAttendee", "export const cancelRegistration");
    const registration = section(source, "export const cancelRegistration", "export const renameAttendee");
    assert.equal(attendee.includes("withTransaction"), true);
    assert.equal(registration.includes("withTransaction"), true);
    assert.equal(attendee.includes("for update"), true);
    assert.equal(registration.includes("for update"), true);
    assert.equal(attendee.slice(attendee.indexOf("withTransaction")).includes("getSql("), false);
    assert.equal(registration.slice(registration.indexOf("withTransaction")).includes("getSql("), false);
  });
});
