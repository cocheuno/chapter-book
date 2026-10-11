import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LIST_SEEDS } from "./lists.ts";
import {
  composePersonName,
  hasDoctorate,
  isDegreeTitle,
  postNominalsText,
  salutation,
  titleKey,
} from "./names.ts";

// Frozen copies of composePersonName and composedHonorific from before post-nominals.
function foldName(value: string): string {
  return value
    .trim()
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function oldComposedHonorific(religious?: string | null, academic?: string | null): string | null {
  const r = religious?.trim();
  const a = academic?.trim();
  if (r && a && r !== a) return r;
  return r || a || null;
}

function formatMiddle(raw: string): string {
  const t = raw.trim().replace(/\.$/, "");
  if (!t) return "";
  return t.length === 1 ? `${t}.` : t;
}

function attachSuffix(core: string, suffix: string): string {
  if (!suffix) return core;
  if (/^[IVXLC]+$/i.test(suffix)) return `${core} ${suffix}`;
  return `${core}, ${suffix}`;
}

type OldNameParts = {
  religiousTitle?: string | null;
  academicTitle?: string | null;
  honorific?: string | null;
  givenName?: string | null;
  middleName?: string | null;
  middleInitial?: string | null;
  familyName?: string | null;
  suffix?: string | null;
  displayName?: string | null;
};

function oldComposePersonName(p: OldNameParts): string {
  const honorific = oldComposedHonorific(p.religiousTitle, p.academicTitle) || p.honorific?.trim() || "";
  const given = (p.givenName ?? "").trim();
  const middle = formatMiddle(p.middleName ?? p.middleInitial ?? "");
  const family = (p.familyName ?? "").trim();
  const suffix = (p.suffix ?? "").trim();
  const core = attachSuffix([given, middle, family].filter(Boolean).join(" "), suffix);
  if (!core) return honorific;
  if (!honorific) return core;
  if (foldName(core).startsWith(foldName(honorific))) return core;
  return `${honorific} ${core}`;
}

describe("composePersonName parity", () => {
  it("matches the old name when post-nominals are empty", () => {
    const religiousTitles = ["", ...LIST_SEEDS.religious_title];
    const academicTitles = ["", ...LIST_SEEDS.academic_title];
    for (const religiousTitle of religiousTitles) {
      for (const academicTitle of academicTitles) {
        for (const suffix of ["", "Jr."]) {
          const base = {
            religiousTitle,
            academicTitle,
            givenName: "John",
            middleName: "Q",
            familyName: "Doe",
            suffix,
          };
          for (const postNominals of [undefined, null, ""] as const) {
            assert.equal(
              composePersonName({ ...base, postNominals }),
              oldComposePersonName(base),
              JSON.stringify({ ...base, postNominals }),
            );
          }
        }
      }
    }
  });
});

describe("composePersonName post-nominals", () => {
  it("keeps a religious title and appends post-nominals", () => {
    assert.equal(
      composePersonName({
        religiousTitle: "Rev.",
        givenName: "John",
        familyName: "Doe",
        postNominals: "S.J., Ph.D.",
      }),
      "Rev. John Doe, S.J., Ph.D.",
    );
  });

  it("keeps the religious title for a priest-scientist", () => {
    assert.equal(
      composePersonName({
        religiousTitle: "Rev.",
        academicTitle: "Dr.",
        givenName: "John",
        familyName: "Doe",
        postNominals: "S.J., Ph.D.",
      }),
      "Rev. John Doe, S.J., Ph.D.",
    );
  });

  it("drops Dr. when a doctorate is already in the post-nominals", () => {
    assert.equal(
      composePersonName({
        academicTitle: "Dr.",
        givenName: "Jane",
        familyName: "Doe",
        postNominals: "Ph.D.",
      }),
      "Jane Doe, Ph.D.",
    );
  });

  it("keeps Prof. in front of post-nominals", () => {
    assert.equal(
      composePersonName({
        academicTitle: "Prof.",
        givenName: "Jane",
        familyName: "Doe",
        postNominals: "Ph.D.",
      }),
      "Prof. Jane Doe, Ph.D.",
    );
  });

  it("places the suffix before the post-nominals", () => {
    assert.equal(
      composePersonName({
        givenName: "John",
        familyName: "Doe",
        suffix: "Jr.",
        postNominals: "M.D.",
      }),
      "John Doe, Jr., M.D.",
    );
  });

  it("spaces a cramped post-nominal list before appending it", () => {
    assert.equal(postNominalsText("S.J.,Ph.D. "), "S.J., Ph.D.");
    const name = composePersonName({
      givenName: "John",
      familyName: "Doe",
      postNominals: "S.J.,Ph.D. ",
    });
    assert.equal(name, "John Doe, S.J., Ph.D.");
    assert.equal(name.slice(name.indexOf(",")), ", S.J., Ph.D.");
  });
});

describe("salutation", () => {
  const smith = { givenName: "John", familyName: "Smith" };

  it("follows the review table", () => {
    assert.equal(salutation({ ...smith, religiousTitle: "Most Rev." }), "Dear Bishop Smith");
    assert.equal(salutation({ ...smith, religiousTitle: "Bishop" }), "Dear Bishop Smith");
    assert.equal(salutation({ ...smith, religiousTitle: "Cardinal" }), "Your Eminence");
    assert.equal(salutation({ ...smith, religiousTitle: "Msgr." }), "Dear Monsignor Smith");
    assert.equal(salutation({ ...smith, religiousTitle: "Rev." }), "Dear Father Smith");
    assert.equal(salutation({ ...smith, religiousTitle: "Fr." }), "Dear Father Smith");
    assert.equal(salutation({ ...smith, religiousTitle: "Very Rev." }), "Dear Father Smith");
    assert.equal(salutation({ ...smith, religiousTitle: "Deacon" }), "Dear Deacon Smith");
    assert.equal(salutation({ ...smith, religiousTitle: "Dcn." }), "Dear Deacon Smith");
    assert.equal(
      salutation({ religiousTitle: "Sr.", givenName: "Mary Ann", familyName: "Kowalski" }),
      "Dear Sister Mary Ann",
    );
    assert.equal(
      salutation({ religiousTitle: "Mother", givenName: "Mary Ann", familyName: "Kowalski" }),
      "Dear Mother Mary Ann",
    );
    assert.equal(salutation({ religiousTitle: "Br.", givenName: "John", familyName: "Smith" }), "Dear Brother John");
    assert.equal(salutation({ ...smith, religiousTitle: "Abbot" }), "Dear Father Abbot");
    assert.equal(salutation({ ...smith, academicTitle: "Dr." }), "Dear Dr. Smith");
    assert.equal(salutation({ ...smith, academicTitle: "Prof." }), "Dear Professor Smith");
    assert.equal(salutation({ ...smith, religiousTitle: "Pope" }), "Your Holiness");
  });

  it("covers mixed titles, degrees, a plain name, and an override", () => {
    assert.equal(
      salutation({ ...smith, religiousTitle: "Rev.", academicTitle: "Dr." }),
      "Dear Father Smith",
    );
    assert.equal(salutation({ ...smith, academicTitle: "Ph.D." }), "Dear Dr. Smith");
    assert.equal(salutation({ ...smith, postNominals: "Ph.D." }), "Dear Dr. Smith");
    assert.equal(salutation({ givenName: "Jane", familyName: "Smith" }), "Dear Jane Smith");
    assert.equal(salutation({}), "Dear Friend");
    assert.equal(
      salutation({
        religiousTitle: "Sr.",
        givenName: "Mary Ann",
        familyName: "Kowalski",
        salutationOverride: "Dear Sister Kowalski",
      }),
      "Dear Sister Kowalski",
    );
    assert.equal(salutation({ ...smith, religiousTitle: "FR" }), "Dear Father Smith");
    assert.equal(salutation({ ...smith, religiousTitle: "fr." }), "Dear Father Smith");
  });
});

describe("title helpers", () => {
  it("folds titles, spaces post-nominals, and detects degrees", () => {
    assert.equal(titleKey("Very Rev."), "veryrev");
    assert.equal(postNominalsText("S.J.,Ph.D. "), "S.J., Ph.D.");
    assert.equal(postNominalsText("S.J., , Ph.D."), "S.J., Ph.D.");
    assert.equal(postNominalsText(null), "");
    assert.equal(hasDoctorate("S.J., Ph.D."), true);
    assert.equal(hasDoctorate("S.J."), false);
    assert.equal(hasDoctorate("M.Sc."), false);
    assert.equal(hasDoctorate("D.Min."), true);
    assert.equal(isDegreeTitle("Ph.D."), true);
    assert.equal(isDegreeTitle("M.D."), true);
    assert.equal(isDegreeTitle("Sc.D."), true);
    assert.equal(isDegreeTitle("M.Sc."), true);
    assert.equal(isDegreeTitle("M.A."), true);
    assert.equal(isDegreeTitle("B.S."), true);
    assert.equal(isDegreeTitle("Dr."), false);
    assert.equal(isDegreeTitle("Prof."), false);
    assert.equal(isDegreeTitle(""), false);
  });
});
