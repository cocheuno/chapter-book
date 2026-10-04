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

const writes = [
  /ensureSite(Content)?\(/,
  /backfill\w*\(/,
  /\binsert\s+into\b/i,
  /\bupdate\s+\w+\s+set\b/i,
  /\bdelete\s+from\b/i,
];

describe("public reads", () => {
  it("loadPublishedSite and getPublicPage only read", () => {
    const source = readFileSync(join(root, "src/lib/crm/site.ts"), "utf8");
    const published = section(source, "export async function loadPublishedSite", "export function publicSiteDto");
    const page = section(source, "export const getPublicPage", "export const removeSiteItem");
    for (const pattern of writes) {
      assert.equal(pattern.test(published), false, String(pattern));
      assert.equal(pattern.test(page), false, String(pattern));
    }
  });

  it("loadMember does not seed the site", () => {
    const source = readFileSync(join(root, "src/lib/crm/member.ts"), "utf8");
    const member = section(source, "if (existing[0])", "const chapters = await sql");
    assert.equal(/ensureSite\(/.test(member), false);
  });

  it("bootstrapChapter still seeds the sample shelf", () => {
    const source = readFileSync(join(root, "src/lib/crm/member.ts"), "utf8");
    assert.equal(source.includes("await ensureSite(sql, chapterId);"), true);
  });

  it("the embed does not cache-bust the feed", () => {
    const source = readFileSync(join(root, "public/embed/chapter-site.js"), "utf8");
    assert.equal(source.includes("?t="), false);
  });
});
