import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCents, parsePriceCents, seatsLeft, ticketOnSale } from "./pricing.ts";

describe("parsePriceCents", () => {
  it("reads whole dollars, one decimal, and a dollar sign", () => {
    assert.equal(parsePriceCents("0"), 0);
    assert.equal(parsePriceCents("25"), 2500);
    assert.equal(parsePriceCents("25.5"), 2550);
    assert.equal(parsePriceCents("$25.50"), 2550);
  });

  it("rejects a negative, extra decimals, words, and more than 100000 dollars", () => {
    assert.equal(parsePriceCents("-1"), null);
    assert.equal(parsePriceCents("1.234"), null);
    assert.equal(parsePriceCents("abc"), null);
    assert.equal(parsePriceCents("100001"), null);
  });
});

describe("formatCents", () => {
  it("prints zero, cents, and a thousands separator", () => {
    assert.equal(formatCents(0), "$0.00");
    assert.equal(formatCents(2550), "$25.50");
    assert.equal(formatCents(125000), "$1,250.00");
  });
});

describe("seatsLeft", () => {
  it("is unlimited when capacity is empty, and never negative", () => {
    assert.equal(seatsLeft({ capacity: null, held: 3, taken: 5 }), null);
    assert.equal(seatsLeft({ capacity: 10, held: 3, taken: 5 }), 2);
    assert.equal(seatsLeft({ capacity: 5, held: 3, taken: 5 }), 0);
  });
});

describe("ticketOnSale", () => {
  const start = "2027-03-01T00:00:00.000Z";
  const end = "2027-03-10T00:00:00.000Z";

  it("follows the active flag and the sales window", () => {
    assert.equal(ticketOnSale({ active: false, sales_start: null, sales_end: null }, new Date("2027-03-05T00:00:00Z")), false);
    assert.equal(ticketOnSale({ active: true, sales_start: start, sales_end: end }, new Date("2027-02-28T00:00:00Z")), false);
    assert.equal(ticketOnSale({ active: true, sales_start: start, sales_end: end }, new Date("2027-03-11T00:00:00Z")), false);
    assert.equal(ticketOnSale({ active: true, sales_start: start, sales_end: end }, new Date("2027-03-05T00:00:00Z")), true);
    assert.equal(ticketOnSale({ active: true, sales_start: null, sales_end: null }, new Date("2027-03-05T00:00:00Z")), true);
  });
});
