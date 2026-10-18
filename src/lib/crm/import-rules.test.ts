import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMPORT_FIELDS,
  classifyRows,
  formatDifference,
  guessMapping,
  mapRows,
  parseCsv,
  roleKey,
  type ExistingPerson,
  type ImportRole,
  type ImportRow,
} from "./import-rules.ts";

const ROLES: ImportRole[] = [
  { key: "educator", label: "Science educator" },
  { key: "friend", label: "Friend" },
  { key: "clergy", label: "Clergy" },
];

function row(partial: Partial<ImportRow> = {}): ImportRow {
  const blank = {} as ImportRow;
  for (const field of IMPORT_FIELDS) blank[field.key] = "";
  return { ...blank, ...partial };
}

function person(
  partial: Partial<ExistingPerson> & Pick<ExistingPerson, "id" | "display_name">,
): ExistingPerson {
  return {
    given_name: "",
    family_name: "",
    emails: [],
    city: "",
    partnerNames: [],
    ...partial,
  };
}

describe("parseCsv", () => {
  it("returns no rows for an empty string", () => {
    assert.deepEqual(parseCsv(""), []);
  });

  it("strips a UTF-8 BOM and keeps the header", () => {
    assert.deepEqual(parseCsv("\uFEFFgiven,family\nAda,Example"), [
      ["given", "family"],
      ["Ada", "Example"],
    ]);
  });

  it("keeps commas, newlines, and doubled quotes inside quotes", () => {
    assert.deepEqual(parseCsv('"a, ""b""\r\nc",d'), [['a, "b"\r\nc', "d"]]);
  });

  it("reads CRLF, LF, and a missing final newline as the same rows", () => {
    assert.deepEqual(parseCsv("a,b\r\nc,d\r\n"), [
      ["a", "b"],
      ["c", "d"],
    ]);
    assert.deepEqual(parseCsv("a,b\nc,d\n"), [
      ["a", "b"],
      ["c", "d"],
    ]);
    assert.deepEqual(parseCsv("a,b\nc,d"), [
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("does not add a row for a trailing newline", () => {
    assert.deepEqual(parseCsv("a,b\n"), [["a", "b"]]);
    assert.deepEqual(parseCsv("a,b\r\n"), [["a", "b"]]);
  });

  it("keeps spaces inside a cell", () => {
    assert.deepEqual(parseCsv(" a , b "), [[" a ", " b "]]);
  });
});

describe("guessMapping", () => {
  it("maps common headers and ignores the rest", () => {
    assert.deepEqual(
      guessMapping([
        "First name",
        "Given",
        "Last name",
        "Surname",
        "E-mail",
        "Zip",
        "Favorite color",
      ]),
      ["given_name", "given_name", "family_name", "family_name", "email", "postal_code", "ignore"],
    );
  });

  it("maps the other contact, title, role, and partner headers", () => {
    assert.deepEqual(
      guessMapping([
        "Telephone",
        "Cell",
        "Address",
        "Address 2",
        "Town",
        "Province",
        "Postal code",
        "Country",
        "URL",
        "Title",
        "Degree",
        "Suffix",
        "Credentials",
        "Role",
        "Parish",
        "Comments",
      ]),
      [
        "phone",
        "mobile",
        "street",
        "street2",
        "city",
        "state",
        "postal_code",
        "country",
        "website",
        "religious_title",
        "academic_title",
        "suffix",
        "post_nominals",
        "role",
        "partner",
        "notes",
      ],
    );
  });
});

describe("mapRows", () => {
  it("trims cells and keeps the first non-blank column for a field", () => {
    const mapped = mapRows(
      [
        ["Email", "E-mail", "City"],
        ["", " ada@example.com ", " Northtown "],
        ["first@example.com", "second@example.com", ""],
      ],
      ["email", "email", "city"],
    );
    assert.equal(mapped[0].email, "ada@example.com");
    assert.equal(mapped[0].city, "Northtown");
    assert.equal(mapped[0].phone, "");
    assert.equal(mapped[1].email, "first@example.com");
  });
});

describe("roleKey", () => {
  it("matches a key or a label, and uses friend otherwise", () => {
    assert.equal(roleKey("Science educator", ROLES), "educator");
    assert.equal(roleKey("CLERGY", ROLES), "clergy");
    assert.equal(roleKey("", ROLES), "friend");
    assert.equal(roleKey("Neighbor", ROLES), "friend");
  });
});

describe("classifyRows", () => {
  const ada = person({
    id: "ada",
    display_name: "Ada Example",
    given_name: "Ada",
    family_name: "Example",
    emails: ["ada@example.com", "ada.work@example.com"],
    city: "Northtown",
    partnerNames: ["North Parish"],
    phone: "555",
    state: "EX",
    roles: ["educator"],
  });

  it("marks a missing name or a bad email invalid, and allows a blank email", () => {
    const classes = classifyRows(
      [
        row({ given_name: "  ", family_name: "Example", email: "ada@example.com" }),
        row({ given_name: "Ben", family_name: "   ", email: "ben@example.com" }),
        row({ given_name: "Cara", family_name: "Example", email: "ada@example" }),
        row({ given_name: "Dana", family_name: "Example", email: "dana" }),
        row({ given_name: "Eve", family_name: "Example", email: "" }),
        row({ given_name: "Fay", family_name: "Example", email: " fay@example.com " }),
      ],
      [],
    );
    assert.deepEqual(
      classes.map((item) => item.kind),
      ["invalid", "invalid", "invalid", "invalid", "new", "new"],
    );
    assert.equal(classes[0].reason, "Missing a first or last name.");
    assert.equal(classes[2].reason, "Email is not an address.");
    assert.equal(classes[4].reason, "");
  });

  it("does not let an invalid earlier row hide a later one", () => {
    const classes = classifyRows(
      [
        row({ given_name: "", family_name: "Example", email: "ada@example.com" }),
        row({
          given_name: "Ada",
          family_name: "Example",
          email: "ada@example.com",
          city: "Northtown",
        }),
      ],
      [],
    );
    assert.deepEqual(
      classes.map((item) => item.kind),
      ["invalid", "new"],
    );
  });

  it("marks a later row with the same email, or the same name and city, as a duplicate in the file", () => {
    const classes = classifyRows(
      [
        row({
          given_name: "Ada",
          family_name: "Example",
          email: "Ada@Example.com",
          city: "Northtown",
        }),
        row({ given_name: "Ben", family_name: "Example", email: "ada@example.com", city: "Other" }),
        row({ given_name: "Cara", family_name: "Example", email: "", city: "" }),
        row({ given_name: "cara", family_name: "example", email: "", city: "" }),
        row({ given_name: "Dana", family_name: "Example", email: "", city: "Northtown" }),
        row({ given_name: "Eve", family_name: "Example", email: "", city: "Madison" }),
      ],
      [],
    );
    assert.equal(classes[0].kind, "new");
    assert.equal(classes[1].kind, "duplicate_in_file");
    assert.equal(classes[1].reason, "Same email as an earlier row.");
    assert.equal(classes[2].kind, "new");
    assert.equal(classes[3].kind, "duplicate_in_file");
    assert.equal(classes[3].reason, "Same name and city as an earlier row.");
    assert.equal(classes[4].kind, "new");
    assert.equal(classes[5].kind, "new");
  });

  it("matches any stored email and lists only non-blank differences", () => {
    const classes = classifyRows(
      [
        row({
          given_name: "Ada",
          family_name: "Example",
          email: "ADA.WORK@example.com",
          phone: "556",
          city: "northtown",
          state: "",
          notes: "Brings a guest",
          role: "Science educator",
          partner: "north parish",
        }),
      ],
      [ada],
      ROLES,
    );
    assert.equal(classes[0].kind, "match");
    assert.equal(classes[0].personId, "ada");
    assert.equal(classes[0].personName, "Ada Example");
    assert.deepEqual(
      classes[0].differences.map((diff) => diff.field),
      ["phone", "notes"],
    );
    assert.equal(formatDifference(classes[0].differences[0]), "Phone: 555 → 556");
    assert.equal(classes[0].differences[1].stored, "");
    assert.equal(classes[0].differences[1].file, "Brings a guest");
  });

  it("keeps a match with no differences, and lets a file duplicate win over a match", () => {
    const same = row({
      given_name: "Ada",
      family_name: "Example",
      email: "ada@example.com",
      city: "Northtown",
      phone: "555",
    });
    const classes = classifyRows([same, { ...same, city: "Other" }], [ada], ROLES);
    assert.equal(classes[0].kind, "match");
    assert.deepEqual(classes[0].differences, []);
    assert.equal(classes[1].kind, "duplicate_in_file");
    assert.equal(classes[1].personId, null);
  });

  it("prefers an email match over a different person with the same name and city", () => {
    const ben = person({
      id: "ben",
      display_name: "Ben Example",
      given_name: "Ada",
      family_name: "Example",
      emails: [],
      city: "Northtown",
    });
    const classes = classifyRows(
      [
        row({
          given_name: "Ada",
          family_name: "Example",
          email: "ada@example.com",
          city: "Northtown",
        }),
      ],
      [ben, ada],
    );
    assert.equal(classes[0].kind, "match");
    assert.equal(classes[0].personId, "ada");
  });

  it("marks the same name with the same city, or a shared partner, as a possible duplicate", () => {
    const classes = classifyRows(
      [
        row({ given_name: "ada", family_name: "EXAMPLE", email: "", city: " northtown " }),
        row({
          given_name: "Ada",
          family_name: "Example",
          email: "other@example.com",
          city: "Madison",
          partner: "North Parish",
        }),
        row({
          given_name: "Ada",
          family_name: "Example",
          email: "third@example.com",
          city: "Southtown",
        }),
        row({ given_name: "Ada", family_name: "Example", email: "", city: "" }),
      ],
      [ada],
    );
    assert.equal(classes[0].kind, "possible_duplicate");
    assert.equal(classes[0].personId, "ada");
    assert.equal(classes[0].personName, "Ada Example");
    assert.deepEqual(classes[0].differences, []);
    assert.equal(classes[1].kind, "possible_duplicate");
    assert.equal(classes[2].kind, "new");
    assert.equal(classes[3].kind, "new");
  });

  it("treats two blank cities as the same city", () => {
    const blankCity = person({
      id: "blank",
      display_name: "Ben Example",
      given_name: "Ben",
      family_name: "Example",
      emails: [],
      city: "",
      partnerNames: [],
    });
    const classes = classifyRows(
      [
        row({ given_name: "Ben", family_name: "Example", city: "" }),
        row({ given_name: "Ben", family_name: "Example", city: "   " }),
      ],
      [blankCity],
    );
    assert.equal(classes[0].kind, "possible_duplicate");
    assert.equal(classes[1].kind, "duplicate_in_file");
  });

  it("lists a role or partner only when the file value is not already stored", () => {
    const classes = classifyRows(
      [
        row({
          given_name: "Ada",
          family_name: "Example",
          email: "ada@example.com",
          role: "Neighbor",
          partner: "Saint Example School",
        }),
      ],
      [ada],
      ROLES,
    );
    assert.equal(classes[0].kind, "match");
    assert.deepEqual(
      classes[0].differences.map((diff) => `${diff.label}: ${diff.stored} → ${diff.file}`),
      ["Role: Science educator → Neighbor", "Partner: North Parish → Saint Example School"],
    );
  });

  it("compares a role to stored keys when no catalog is given", () => {
    const classes = classifyRows(
      [
        row({
          given_name: "Ada",
          family_name: "Example",
          email: "ada@example.com",
          role: "educator",
        }),
      ],
      [ada],
    );
    assert.equal(classes[0].kind, "match");
    assert.deepEqual(classes[0].differences, []);
  });
});
