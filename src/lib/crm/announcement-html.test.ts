import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  announcementPlainText,
  announcementRichHtml,
  excerptText,
  publicAboutFields,
  publicCopyHtml,
  publicRichHtml,
  publicSummaryFields,
} from "./announcement-html.ts";

describe("announcement HTML", () => {
  it("leaves plain text as text", () => {
    assert.equal(announcementRichHtml("Chapter Mass is Tuesday at 6."), null);
    assert.equal(announcementRichHtml("a < b"), null);
    assert.equal(announcementRichHtml("See <section>inside</section> the note"), null);
  });

  it("renders one section of rich content", () => {
    const html = announcementRichHtml(
      `<section class="note" id="gold">
        <h2>Gold Mass</h2>
        <p>Join us <strong>Tuesday</strong>.</p>
        <ul><li>Parking is free</li></ul>
        <p><a href="https://scs-wisconsin-usa.org/mass">Details</a></p>
      </section>`,
    );
    assert.ok(html);
    assert.match(html, /^<section class="note" id="gold">/);
    assert.match(html, /<h2>Gold Mass<\/h2>/);
    assert.match(html, /<strong>Tuesday<\/strong>/);
    assert.match(html, /<li>Parking is free<\/li>/);
    assert.match(html, /href="https:\/\/scs-wisconsin-usa.org\/mass"/);
    assert.match(html, /rel="noreferrer noopener"/);
    assert.match(html, /<\/section>$/);
  });

  it("strips scripts, handlers, and javascript urls", () => {
    const html = announcementRichHtml(
      `<section><script>alert(1)</script><p onclick="alert(1)">Hi</p><a href="javascript:alert(1)">x</a><img src="javascript:alert(1)" alt="no"><iframe src="https://evil.example"></iframe></section>`,
    );
    assert.equal(html, `<section><p>Hi</p>x</section>`);
    assert.doesNotMatch(html ?? "", /script|onclick|javascript|iframe|img/i);
  });

  it("keeps safe images and inline styles", () => {
    const html = announcementRichHtml(
      `<section><img src="https://scs-wisconsin-usa.org/crest.png" alt="Crest"><p style="color: #7a6238">Welcome</p></section>`,
    );
    assert.match(html ?? "", /src="https:\/\/scs-wisconsin-usa.org\/crest.png"/);
    assert.match(html ?? "", /alt="Crest"/);
    assert.match(html ?? "", /style="color: #7a6238"/);
  });

  it("drops style that can load a url", () => {
    const html = announcementRichHtml(
      `<section><p style="background: url(https://evil.example/x)">Hi</p></section>`,
    );
    assert.equal(html, "<section><p>Hi</p></section>");
  });

  it("keeps allowed style properties", () => {
    const html = announcementRichHtml(
      `<section><p style="text-align: center; color: #7a6238; margin-top: 1rem; padding: 0; width: 100%; border-radius: 4px">Hi</p></section>`,
    );
    assert.match(
      html ?? "",
      /style="text-align: center; color: #7a6238; margin-top: 1rem; padding: 0; width: 100%; border-radius: 4px"/,
    );
  });

  it("drops position, z-index, opacity, and transform", () => {
    const html = announcementRichHtml(
      `<section><p style="position:fixed; z-index: 9; opacity: 0; transform: rotate(1deg)">Hi</p></section>`,
    );
    assert.equal(html, "<section><p>Hi</p></section>");
  });

  it("keeps only the allowed part of a mixed style", () => {
    const html = announcementRichHtml(
      `<section><p style="color: red; position: fixed; z-index: 99">Hi</p></section>`,
    );
    assert.match(html ?? "", /style="color: red"/);
    assert.doesNotMatch(html ?? "", /position|z-index/);
  });

  it("drops url() inside an allowed property", () => {
    const html = announcementRichHtml(
      `<section><p style="color: red; background-color: url(https://evil.example/x)">Hi</p></section>`,
    );
    assert.match(html ?? "", /style="color: red"/);
    assert.doesNotMatch(html ?? "", /url|background-color/);
  });

  it("drops negative margins and keeps ordinary ones", () => {
    const top = announcementRichHtml(`<section><p style="margin-top: -40px">Hi</p></section>`);
    assert.equal(top, "<section><p>Hi</p></section>");

    const shifted = announcementRichHtml(`<section><p style="margin: 0 -9999px">Hi</p></section>`);
    assert.equal(shifted, "<section><p>Hi</p></section>");

    const kept = announcementRichHtml(
      `<section><p style="margin: 0 auto; margin-top: 12px">Hi</p></section>`,
    );
    assert.match(kept ?? "", /style="margin: 0 auto; margin-top: 12px"/);

    const mixed = announcementRichHtml(
      `<section><p style="color: red; margin-top: -40px">Hi</p></section>`,
    );
    assert.match(mixed ?? "", /style="color: red"/);
    assert.doesNotMatch(mixed ?? "", /margin/);
  });

  it("renders a pasted chapter announcement section", () => {
    const html = announcementRichHtml(`<section class="announcements" id="announcements">
      <div class="announce-card">
        <span class="eyebrow tag-aen">Gold Mass &middot; Madison</span>
        <h3>Madison-area Gold Mass</h3>
        <p class="when"><b>Saturday, 21 November 2026 &middot; 11:00 AM</b><br>Holy Redeemer Catholic Church</p>
        <p>Register <a href="./formsubmitter.html"><b>here</b></a>.</p>
      </div>
    </section>`);
    assert.ok(html);
    assert.match(html ?? "", /^<section class="announcements" id="announcements">/);
    assert.match(html ?? "", /Gold Mass · Madison/);
    assert.doesNotMatch(html ?? "", /&amp;middot;|&lt;section/);
    assert.match(html ?? "", /href="https:\/\/scs-wisconsin-usa.org\/formsubmitter\.html"/);
    assert.match(html ?? "", /<br>/);
    const published = publicSummaryFields("announcement", null, html);
    assert.equal(published.summaryHtml, html);
    assert.match(published.summary ?? "", /Madison-area Gold Mass/);
  });

  it("sanitizes HTML on event details and biographies, not only announcements", () => {
    const raw = "<section><script>alert(1)</script><p>Hi</p></section>";
    const event = publicSummaryFields("event", raw);
    assert.equal(event.summaryHtml, "<section><p>Hi</p></section>");
    assert.equal(event.summary, "Hi");
    const bio = publicRichHtml("<p>First paragraph.</p><p>Second <em>paragraph</em>.</p>");
    assert.equal(bio, "<p>First paragraph.</p><p>Second <em>paragraph</em>.</p>");
    assert.equal(publicRichHtml("Plain biography."), null);
    const announcement = publicSummaryFields("announcement", raw);
    assert.equal(announcement.summaryHtml, "<section><p>Hi</p></section>");
    assert.equal(announcementPlainText(announcement.summaryHtml ?? ""), "Hi");
  });

  it("wraps public copy in one section and leaves plain text alone", () => {
    const section = "<section><h2>Hi</h2><p>Text</p></section>";
    const html = publicCopyHtml(section);
    assert.ok(html);
    assert.match(html, /<h2>Hi<\/h2>/);
    assert.ok(html.startsWith("<section"));
    assert.equal(html, publicRichHtml(section));

    assert.equal(publicCopyHtml("<p>Hi</p>"), "<section><p>Hi</p></section>");
    assert.equal(publicCopyHtml("Plain words\nSecond line"), null);
    assert.equal(publicCopyHtml(null), null);

    const hostile = publicCopyHtml(
      '<section><script>alert(1)</script><p onclick="x()">Hi</p><img src="x" onerror="y()"></section>',
    );
    assert.ok(hostile);
    assert.equal(hostile.includes("script"), false);
    assert.equal(hostile.includes("onclick"), false);
    assert.equal(hostile.includes("onerror"), false);
  });

  it("turns HTML into excerpt words and keeps plain text", () => {
    const words = excerptText("<section><h2>Hi</h2><p>Text</p></section>");
    assert.equal(words, "Hi Text");
    assert.equal(words?.includes("<"), false);
    assert.equal(excerptText("Line one\nLine two"), "Line one\nLine two");
  });

  it("adds aboutHtml only when the masthead has HTML", () => {
    assert.deepEqual(publicAboutFields("Plain about"), { about: "Plain about" });
    const rich = publicAboutFields("<section><p>A</p></section>");
    assert.ok(rich.aboutHtml?.startsWith("<section"));
    assert.equal(rich.about, "A");
  });

  it("sends article summaries as one section", () => {
    const article = publicSummaryFields("article", "<p>Hi</p>");
    assert.equal(article.summaryHtml, "<section><p>Hi</p></section>");
    assert.equal(article.summary, "Hi");
  });
});
