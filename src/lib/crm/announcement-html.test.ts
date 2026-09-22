import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { announcementPlainText, announcementRichHtml, publicSummaryFields } from "./announcement-html.ts";

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
    assert.equal(
      html,
      `<section><p>Hi</p>x</section>`,
    );
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
    const html = announcementRichHtml(`<section><p style="background: url(https://evil.example/x)">Hi</p></section>`);
    assert.equal(html, "<section><p>Hi</p></section>");
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
    assert.match(html ?? "", /href="\.\/formsubmitter\.html"/);
    assert.match(html ?? "", /<br>/);
    const published = publicSummaryFields("announcement", null, html);
    assert.equal(published.summaryHtml, html);
    assert.match(published.summary ?? "", /Madison-area Gold Mass/);
  });

  it("does not treat an event section as public HTML", () => {
    const raw = "<section><script>alert(1)</script><p>Hi</p></section>";
    const event = publicSummaryFields("event", raw);
    assert.equal(event.summaryHtml, null);
    assert.equal(event.summary, raw);
    const announcement = publicSummaryFields("announcement", raw);
    assert.equal(announcement.summaryHtml, "<section><p>Hi</p></section>");
    assert.equal(announcement.summary, "Hi");
    assert.equal(announcementPlainText(announcement.summaryHtml ?? ""), "Hi");
  });
});
