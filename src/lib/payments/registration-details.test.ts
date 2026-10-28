import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIETARY_TAGS,
  LODGING,
  LODGING_REQUIRED,
  REFUND_REQUIRED,
  TITLES,
  attendeeForRole,
  badgePrintName,
  blankDetails,
  detailsErrors,
  detailsSchema,
  dietaryTagCounts,
  lodgingLabel,
  nightOptions,
  normalizeDetails,
  personRoleKey,
  personTitles,
  readDetails,
  storedDietary,
} from "./registration-details.ts";

const NIGHTS = "Thursday, April 15\nFriday, April 16";

function filled(over: Record<string, unknown> = {}) {
  return {
    ...blankDetails(),
    title: "Dr.",
    badgeName: "Ann",
    position: "Professor",
    city: "Madison",
    state: "WI",
    dietaryTags: ["vegetarian"],
    lodging: "none",
    nights: [],
    roomShare: false,
    roommate: "",
    parking: false,
    notes: "",
    refundAcknowledged: false,
    ...over,
  };
}

describe("TITLES, dietary tags, and lodging", () => {
  it("lists the title choices, including a blank", () => {
    assert.deepEqual(TITLES, ["", "Dr.", "Prof.", "Fr.", "Rev.", "Msgr.", "Deacon", "Sr.", "Br.", "Mr.", "Mrs.", "Ms."]);
  });

  it("lists the dietary tags", () => {
    assert.equal(DIETARY_TAGS.vegetarian, "Vegetarian");
    assert.equal(DIETARY_TAGS.vegan, "Vegan");
    assert.equal(DIETARY_TAGS.gluten_free, "Gluten-free");
    assert.equal(DIETARY_TAGS.dairy_free, "Dairy-free");
    assert.equal(DIETARY_TAGS.nut_allergy, "Nut allergy");
    assert.equal(DIETARY_TAGS.shellfish_allergy, "Shellfish allergy");
    assert.equal(DIETARY_TAGS.other, "Other (describe below)");
  });

  it("lists the lodging choices", () => {
    assert.equal(LODGING.none, "I don't need lodging");
    assert.equal(LODGING.hotel_block, "I'll book the conference hotel block");
    assert.equal(LODGING.need_help, "Please help me find lodging");
    assert.equal(LODGING.friends, "Staying with family or friends");
    assert.equal(lodgingLabel("hotel_block"), LODGING.hotel_block);
    assert.equal(lodgingLabel("tent"), "");
  });
});

describe("detailsSchema", () => {
  it("accepts a complete answer, including a listed night", () => {
    const parsed = detailsSchema(NIGHTS).safeParse(
      filled({ lodging: "hotel_block", nights: ["Friday, April 16"], refundAcknowledged: true }),
    );
    assert.equal(parsed.success, true);
    if (parsed.success) assert.deepEqual(parsed.data.nights, ["Friday, April 16"]);
  });

  it("accepts a blank title and omits lodging", () => {
    const parsed = detailsSchema("").safeParse(filled({ title: "", lodging: undefined }));
    assert.equal(parsed.success, true);
  });

  it("rejects a title, a tag, a night, or a length that is not allowed", () => {
    assert.equal(detailsSchema(NIGHTS).safeParse(filled({ title: "Mx." })).success, false);
    assert.equal(detailsSchema(NIGHTS).safeParse(filled({ badgeName: "A".repeat(61) })).success, false);
    assert.equal(detailsSchema(NIGHTS).safeParse(filled({ notes: "n".repeat(501) })).success, false);
    assert.equal(detailsSchema(NIGHTS).safeParse(filled({ dietaryTags: ["vegan", "vegan"] })).success, false);
    assert.equal(detailsSchema(NIGHTS).safeParse(filled({ dietaryTags: Array(8).fill("vegan") })).success, false);
    assert.equal(detailsSchema(NIGHTS).safeParse(filled({ lodging: "tent" })).success, false);
    const wrongNight = detailsSchema(NIGHTS).safeParse(filled({ nights: ["Saturday, April 17"] }));
    assert.equal(wrongNight.success, false);
    if (!wrongNight.success) assert.equal(wrongNight.error.issues[0]?.message, "Choose a listed night.");
    assert.equal(detailsSchema(NIGHTS).safeParse(filled({ nights: Array(8).fill("Thursday, April 15") })).success, false);
  });
});

describe("nightOptions", () => {
  it("keeps trimmed non-blank lines, at most 7", () => {
    assert.deepEqual(nightOptions(" Thursday, April 15 \n\nFriday, April 16\n"), [
      "Thursday, April 15",
      "Friday, April 16",
    ]);
    assert.deepEqual(nightOptions("a\nb\nc\nd\ne\nf\ng\nh"), ["a", "b", "c", "d", "e", "f", "g"]);
    assert.deepEqual(nightOptions(null), []);
    assert.deepEqual(nightOptions(" \n \n"), []);
  });
});

describe("normalizeDetails", () => {
  it("trims text and drops a blank lodging choice", () => {
    const normalized = normalizeDetails({
      ...blankDetails(),
      badgeName: " Ann ",
      city: " Madison ",
      nights: [" Friday, April 16 ", ""],
      lodging: "  ",
    });
    assert.equal(normalized.badgeName, "Ann");
    assert.equal(normalized.city, "Madison");
    assert.deepEqual(normalized.nights, ["Friday, April 16"]);
    assert.equal(normalized.lodging, undefined);
  });
});

describe("detailsErrors", () => {
  const open = { housingAsked: false, refundPolicyShown: false, paid: false };

  it("asks for lodging only when housing is on the form and none was chosen", () => {
    assert.deepEqual(detailsErrors({ lodging: "" }, { ...open, housingAsked: true }), [LODGING_REQUIRED]);
    assert.deepEqual(detailsErrors({}, { ...open, housingAsked: true }), [LODGING_REQUIRED]);
    assert.deepEqual(detailsErrors({ lodging: "none" }, { ...open, housingAsked: true }), []);
    assert.deepEqual(detailsErrors({}, open), []);
  });

  it("asks for the refund acknowledgement only on a paid ticket when a policy is shown", () => {
    const paid = { ...open, paid: true, refundPolicyShown: true };
    assert.deepEqual(detailsErrors({ refundAcknowledged: false }, paid), [REFUND_REQUIRED]);
    assert.deepEqual(detailsErrors({ refundAcknowledged: true }, paid), []);
    assert.deepEqual(detailsErrors({ refundAcknowledged: false }, { ...open, paid: true }), []);
    assert.deepEqual(detailsErrors({ refundAcknowledged: false }, { ...open, refundPolicyShown: true }), []);
  });

  it("requires the affiliation when the ticket asks a question", () => {
    assert.deepEqual(
      detailsErrors({}, { ...open, affiliationPrompt: "Your school", affiliation: " " }),
      ["Your school is required."],
    );
    assert.deepEqual(
      detailsErrors({}, { ...open, affiliationPrompt: " Your school ", affiliation: "St. Example" }),
      [],
    );
    assert.deepEqual(detailsErrors({}, { ...open, affiliationPrompt: "  ", affiliation: "" }), []);
  });

  it("returns every problem together", () => {
    assert.deepEqual(
      detailsErrors(
        { lodging: "", refundAcknowledged: false },
        {
          housingAsked: true,
          refundPolicyShown: true,
          paid: true,
          affiliationPrompt: "Your religious community or diocese",
          affiliation: "",
        },
      ),
      [LODGING_REQUIRED, REFUND_REQUIRED, "Your religious community or diocese is required."],
    );
  });
});

describe("new person fields", () => {
  it("maps religious and academic titles and leaves the others blank", () => {
    assert.deepEqual(personTitles("Fr."), { religiousTitle: "Fr.", academicTitle: null });
    assert.deepEqual(personTitles("Rev."), { religiousTitle: "Rev.", academicTitle: null });
    assert.deepEqual(personTitles("Msgr."), { religiousTitle: "Msgr.", academicTitle: null });
    assert.deepEqual(personTitles("Deacon"), { religiousTitle: "Deacon", academicTitle: null });
    assert.deepEqual(personTitles("Sr."), { religiousTitle: "Sr.", academicTitle: null });
    assert.deepEqual(personTitles("Br."), { religiousTitle: "Br.", academicTitle: null });
    assert.deepEqual(personTitles("Dr."), { religiousTitle: null, academicTitle: "Dr." });
    assert.deepEqual(personTitles("Prof."), { religiousTitle: null, academicTitle: "Prof." });
    assert.deepEqual(personTitles("Ms."), { religiousTitle: null, academicTitle: null });
    assert.deepEqual(personTitles(""), { religiousTitle: null, academicTitle: null });
  });

  it("joins dietary tag labels with the typed note", () => {
    assert.equal(storedDietary(["nut_allergy", "vegan"], " peanuts "), "Vegan; Nut allergy; peanuts");
    assert.equal(storedDietary([], "  "), null);
    assert.equal(storedDietary(["other"], ""), "Other (describe below)");
  });

  it("keeps a People role key and drops anything else", () => {
    assert.equal(personRoleKey("student"), "student");
    assert.equal(personRoleKey(" friend "), "friend");
    assert.equal(personRoleKey(""), null);
    assert.equal(personRoleKey("pastor"), null);
  });
});

describe("desk details", () => {
  it("counts each dietary tag once per person", () => {
    assert.deepEqual(
      dietaryTagCounts([["vegan", "vegan", "gluten_free"], ["vegan"], ["unknown"]]),
      [
        { key: "vegan", label: "Vegan", count: 2 },
        { key: "gluten_free", label: "Gluten-free", count: 1 },
      ],
    );
  });

  it("prints the badge name when set, otherwise the first name", () => {
    assert.equal(badgePrintName(" Ann Lee ", "Ann"), "Ann Lee");
    assert.equal(badgePrintName("  ", "Ann"), "Ann");
    assert.equal(badgePrintName(null, "Ann"), "Ann");
  });

  it("reads stored details and ignores a value that is not details", () => {
    const details = filled({ lodging: "friends", notes: "Arriving late" });
    assert.deepEqual(readDetails(details)?.notes, "Arriving late");
    assert.deepEqual(readDetails(JSON.stringify(details))?.lodging, "friends");
    assert.equal(readDetails("not json"), null);
    assert.equal(readDetails({ title: "Mx." }), null);
  });

  it("strips emergency fields from a viewer desk payload", () => {
    const attendee = {
      givenName: "Ann",
      familyName: "Lee",
      email: "ann.lee@example.com",
      emergencyName: "Pat Example",
      emergencyPhone: "555-0100",
    };
    const desk = {
      registrations: [{ attendees: [attendeeForRole("viewer", attendee)] }],
    };
    const json = JSON.stringify(desk);
    assert.equal(json.includes("emergencyName"), false);
    assert.equal(json.includes("emergencyPhone"), false);
    assert.equal(json.includes("Pat Example"), false);
    assert.equal(json.includes("555-0100"), false);
    assert.equal(json.includes("ann.lee@example.com"), true);
    assert.deepEqual(attendeeForRole("editor", attendee).emergencyName, "Pat Example");
    assert.deepEqual(attendeeForRole("admin", attendee).emergencyPhone, "555-0100");
    assert.equal("emergencyName" in attendeeForRole("guest", attendee), false);
  });
});
