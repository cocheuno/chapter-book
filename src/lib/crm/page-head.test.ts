import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { siteImageSrc } from "./site-image.ts";
import {
  eventJsonLd,
  pageHead,
  plainDescription,
  publicOrigin,
  type SharePage,
} from "./page-head.ts";

const ORIGIN = "https://example.org";

function page(overrides: Partial<SharePage> = {}): SharePage {
  return {
    title: "Gold Mass",
    slug: "gold-mass",
    kind: "event",
    layout: "standard",
    summary: "A Mass for scientists.",
    body: null,
    public_title: "Wisconsin Chapter",
    image_id: "img1",
    location: null,
    ...overrides,
  };
}

describe("publicOrigin", () => {
  it("prefers PUBLIC_ORIGIN and trims one trailing slash", () => {
    assert.equal(
      publicOrigin({
        PUBLIC_ORIGIN: "https://book.example/",
        BETTER_AUTH_URL: "https://other.example",
      }),
      "https://book.example",
    );
  });

  it("falls back to BETTER_AUTH_URL when PUBLIC_ORIGIN is blank", () => {
    assert.equal(
      publicOrigin({ PUBLIC_ORIGIN: "  ", BETTER_AUTH_URL: "https://auth.example/" }),
      "https://auth.example",
    );
  });

  it("returns null for a value that is not an origin", () => {
    assert.equal(
      publicOrigin({ PUBLIC_ORIGIN: "not a url", BETTER_AUTH_URL: "https://auth.example" }),
      null,
    );
  });

  it("returns null when both values are blank", () => {
    assert.equal(publicOrigin({ PUBLIC_ORIGIN: "", BETTER_AUTH_URL: "   " }), null);
    assert.equal(publicOrigin({}), null);
  });
});

describe("plainDescription", () => {
  it("reads the visible words of section HTML", () => {
    assert.equal(plainDescription("<section><h2>Hi</h2><p>Text</p></section>"), "Hi Text");
  });

  it("cuts a long plain text at a space and stays within 160 characters", () => {
    const text = `${"word ".repeat(60)}`;
    assert.equal(text.length, 300);
    const out = plainDescription(text);
    assert.ok(out);
    assert.ok(out.length <= 160);
    assert.equal(out.endsWith("…"), true);
    const body = out.slice(0, -1);
    assert.equal(text.startsWith(body), true);
    assert.equal(text[body.length], " ");
  });

  it("returns null for null", () => {
    assert.equal(plainDescription(null), null);
  });
});

describe("pageHead", () => {
  it("builds the title, one og:title, the canonical URL, the image, and a large card", () => {
    const head = pageHead(page(), ORIGIN);
    assert.equal(head.title, "Gold Mass · Wisconsin Chapter");
    const ogTitles = head.meta.filter(
      (entry) => "property" in entry && entry.property === "og:title",
    );
    assert.equal(ogTitles.length, 1);
    assert.equal("content" in ogTitles[0]! && ogTitles[0].content, "Gold Mass");
    assert.deepEqual(head.links, [{ rel: "canonical", href: "https://example.org/p/gold-mass" }]);
    const image = head.meta.find((entry) => "property" in entry && entry.property === "og:image");
    assert.ok(image && "content" in image);
    assert.equal(image.content, "https://example.org/api/site-image/img1");
    const card = head.meta.find((entry) => "name" in entry && entry.name === "twitter:card");
    assert.ok(card && "content" in card);
    assert.equal(card.content, "summary_large_image");
  });

  it("keeps a real image id on the siteImageSrc path", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const head = pageHead(page({ image_id: id }), ORIGIN);
    const image = head.meta.find((entry) => "property" in entry && entry.property === "og:image");
    assert.equal(siteImageSrc(id), `/api/site-image/${id}`);
    assert.ok(image && "content" in image);
    assert.equal(image.content, `${ORIGIN}${siteImageSrc(id)}`);
  });

  it("omits canonical, og:url, and og:image when the origin is missing", () => {
    const head = pageHead(page(), null);
    assert.deepEqual(head.links, []);
    assert.equal(
      head.meta.some((entry) => "property" in entry && entry.property === "og:url"),
      false,
    );
    assert.equal(
      head.meta.some((entry) => "property" in entry && entry.property === "og:image"),
      false,
    );
    const card = head.meta.find((entry) => "name" in entry && entry.name === "twitter:card");
    assert.ok(card && "content" in card);
    assert.equal(card.content, "summary");
  });

  it("includes JSON-LD only for a dated event", () => {
    const dated = page({ starts_on: "2027-04-15" });
    const undated = page();
    const article = page({ kind: "article", starts_on: "2027-04-15" });
    assert.equal(
      pageHead(article, ORIGIN).meta.some((entry) => "script:ld+json" in entry),
      false,
    );
    assert.equal(
      pageHead(undated, ORIGIN).meta.some((entry) => "script:ld+json" in entry),
      false,
    );
    assert.equal(
      pageHead(dated, ORIGIN).meta.some((entry) => "script:ld+json" in entry),
      true,
    );
  });
});

describe("eventJsonLd", () => {
  it("is null for an article and for an event without a start date", () => {
    assert.equal(eventJsonLd(page({ kind: "article", starts_on: "2027-04-15" }), ORIGIN), null);
    assert.equal(eventJsonLd(page(), ORIGIN), null);
  });

  it("describes a dated event, its place, and the chapter", () => {
    const data = eventJsonLd(
      page({
        starts_on: "2027-04-15",
        ends_on: "2027-04-17",
        location: "University of Wisconsin, Madison",
      }),
      ORIGIN,
    );
    assert.ok(data);
    assert.equal(data["@type"], "Event");
    assert.equal(data.startDate, "2027-04-15");
    assert.equal(data.endDate, "2027-04-17");
    assert.deepEqual(data.location, {
      "@type": "Place",
      name: "University of Wisconsin, Madison",
      address: "University of Wisconsin, Madison",
    });
    assert.equal((data.organizer as { "@type": string })["@type"], "Organization");
    assert.equal(data.eventAttendanceMode, "https://schema.org/OfflineEventAttendanceMode");
    assert.equal(data.eventStatus, "https://schema.org/EventScheduled");
  });

  it("omits endDate when the event has no end", () => {
    const data = eventJsonLd(page({ starts_on: "2027-04-15", ends_on: null }), ORIGIN);
    assert.ok(data);
    assert.equal("endDate" in data, false);
  });
});
