import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "actions.ts"), "utf8");

function section(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, "missing start marker: " + start);
  assert.ok(to > from, "missing end marker: " + end);
  return source.slice(from, to);
}

const chapterJoin = "join events e on e.id = p.event_id and e.chapter_id = ${m.chapterId}";

describe("chapter scope", () => {
  it("scopes both listInvites queries", () => {
    const text = section("export const listInvites", "export const getAttendanceReport");
    assert.equal(text.split(chapterJoin).length - 1, 2);
  });

  it("scopes exportNametags and writes cells with csvRow", () => {
    const text = section("export const exportNametags", "export const listClergy");
    assert.equal(text.split(chapterJoin).length - 1, 1);
    assert.equal(text.includes("csvRow("), true);
  });

  it("scopes the previewMail event lookup", () => {
    const text = section("export const previewMail", "export const sendMail");
    assert.equal(text.includes("e.chapter_id = ${m.chapterId}"), true);
    assert.equal(text.includes('throw new Error("Event not found")'), true);
  });

  it("scopes the sendMail event lookup and the notify-schools task", () => {
    const text = section("export const sendMail", "export const getMailing");
    assert.equal(text.includes("e.chapter_id = ${m.chapterId}"), true);
    assert.equal(text.includes('throw new Error("Event not found")'), true);
    assert.equal(text.includes("and status = 'open' and chapter_id = ${m.chapterId}"), true);
  });

  it("checks the chapter before addInvite writes", () => {
    const text = section("export const addInvite", "export const addNamedGuest");
    assert.equal(text.includes("await assertChapterEvent(sql, m.chapterId, data.eventId);"), true);
  });

  it("checks the chapter before addNamedGuest writes", () => {
    const text = section("export const addNamedGuest", "export const removeParticipation");
    assert.equal(text.includes("await assertChapterEvent(sql, m.chapterId, data.eventId);"), true);
  });

  it("checks the chapter before walkUpCheckIn writes", () => {
    const text = section("export const walkUpCheckIn", "export const closeDoor");
    assert.equal(text.includes("await assertChapterEvent(sql, m.chapterId, data.eventId);"), true);
  });

  it("scopes school doors and event guests in resolveAudience", () => {
    const text = section("async function resolveAudience", "function eventMetaFrom");
    assert.ok(text.split("p.chapter_id = ${m.chapterId}").length - 1 >= 2);
  });
});
