import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SAFE_ENV_FIELDS,
  changedSafeEnvFields,
  clearance,
  clearanceLabel,
  isIsoDate,
  readSafeEnvironment,
  safeEnvToCopy,
  safeEnvironmentView,
  soonestExpiry,
  sortSafeEnvironment,
  withoutSafeEnvironment,
  type SafeEnvPerson,
} from "./safe-environment.ts";

const TODAY = "2026-10-18";

function blank(over: Partial<SafeEnvPerson> = {}): SafeEnvPerson {
  return {
    works_with_minors: false,
    safe_env_program: null,
    safe_env_trained_on: null,
    safe_env_diocese: null,
    background_check_on: null,
    background_check_expires_on: null,
    suitability_requested_on: null,
    suitability_received_on: null,
    suitability_expires_on: null,
    ...over,
  };
}

/** Training and a background check, and no suitability request. */
function ready(over: Partial<SafeEnvPerson> = {}): SafeEnvPerson {
  return blank({
    works_with_minors: true,
    safe_env_program: "Northtown",
    safe_env_trained_on: "2026-01-15",
    safe_env_diocese: "Example Diocese",
    background_check_on: "2026-02-01",
    background_check_expires_on: "2027-02-01",
    ...over,
  });
}

describe("SAFE_ENV_FIELDS", () => {
  it("lists the nine columns in migration order", () => {
    assert.deepEqual(SAFE_ENV_FIELDS, [
      "works_with_minors",
      "safe_env_program",
      "safe_env_trained_on",
      "safe_env_diocese",
      "background_check_on",
      "background_check_expires_on",
      "suitability_requested_on",
      "suitability_received_on",
      "suitability_expires_on",
    ]);
  });
});

describe("migration 0031", () => {
  it("adds the nine columns and does not rewrite rows", () => {
    const path = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../migrations/0031_safe_environment.sql",
    );
    const sql = readFileSync(path, "utf8");
    const lines = sql
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("--"));
    assert.equal(lines.length, 9);
    for (const field of SAFE_ENV_FIELDS) {
      assert.equal(
        lines.some((line) =>
          line.toLowerCase().startsWith(`alter table persons add column if not exists ${field} `),
        ),
        true,
        field,
      );
    }
    assert.match(lines[0] ?? "", /works_with_minors boolean not null default false;/);
    assert.equal(
      lines.slice(1).some((line) => /\bdefault\b/i.test(line)),
      false,
    );
    assert.equal(/\b(update|delete|insert|truncate|drop)\b/i.test(sql), false);
  });
});

describe("isIsoDate", () => {
  it("accepts a real calendar day and rejects an impossible one", () => {
    assert.equal(isIsoDate("2026-02-28"), true);
    assert.equal(isIsoDate("2024-02-29"), true);
    assert.equal(isIsoDate("2026-02-29"), false);
    assert.equal(isIsoDate("2026-02-31"), false);
    assert.equal(isIsoDate("2026-04-31"), false);
    assert.equal(isIsoDate("2026-00-10"), false);
    assert.equal(isIsoDate(""), false);
    assert.equal(isIsoDate("2026-1-01"), false);
  });
});

describe("clearance", () => {
  it("is not needed when the person does not work with minors", () => {
    const person = ready({
      works_with_minors: false,
      background_check_expires_on: "2020-01-01",
      safe_env_trained_on: null,
    });
    assert.equal(clearance(person, TODAY), "not_needed");
  });

  it("is expired when the background check expiry is before today", () => {
    assert.equal(clearance(ready({ background_check_expires_on: "2026-10-17" }), TODAY), "expired");
  });

  it("stays cleared when an expiry is exactly today", () => {
    assert.equal(clearance(ready({ background_check_expires_on: TODAY }), TODAY), "cleared");
    assert.equal(
      clearance(
        ready({
          suitability_requested_on: "2026-03-01",
          suitability_received_on: "2026-03-15",
          suitability_expires_on: TODAY,
        }),
        TODAY,
      ),
      "cleared",
    );
  });

  it("is expired when a requested suitability expires before today", () => {
    assert.equal(
      clearance(
        ready({
          suitability_requested_on: "2026-03-01",
          suitability_received_on: "2026-03-15",
          suitability_expires_on: "2026-10-17",
        }),
        TODAY,
      ),
      "expired",
    );
  });

  it("ignores a suitability expiry when none was requested", () => {
    assert.equal(clearance(ready({ suitability_expires_on: "2020-01-01" }), TODAY), "cleared");
  });

  it("is missing when training or the background check date is empty", () => {
    assert.equal(clearance(ready({ safe_env_trained_on: null }), TODAY), "missing");
    assert.equal(
      clearance(readSafeEnvironment({ ...ready(), safe_env_trained_on: "" }), TODAY),
      "missing",
    );
    assert.equal(clearance(ready({ background_check_on: null }), TODAY), "missing");
  });

  it("is missing when a suitability was requested and not received", () => {
    assert.equal(clearance(ready({ suitability_requested_on: "2026-03-01" }), TODAY), "missing");
    assert.equal(
      clearance(
        ready({
          suitability_requested_on: "2026-03-01",
          suitability_received_on: "2026-04-01",
        }),
        TODAY,
      ),
      "cleared",
    );
  });

  it("is cleared when the required dates are present and current", () => {
    assert.equal(clearance(ready(), TODAY), "cleared");
    assert.equal(clearance(ready({ background_check_expires_on: null }), TODAY), "cleared");
  });

  it("reports expired when the record is also missing", () => {
    assert.equal(
      clearance(
        ready({
          safe_env_trained_on: null,
          background_check_on: null,
          background_check_expires_on: "2026-10-17",
          suitability_requested_on: "2026-03-01",
          suitability_received_on: null,
        }),
        TODAY,
      ),
      "expired",
    );
  });
});

describe("soonestExpiry", () => {
  it("returns the earlier expiry, one expiry, or null", () => {
    assert.equal(
      soonestExpiry(
        ready({ background_check_expires_on: "2027-06-01", suitability_expires_on: "2027-01-01" }),
      ),
      "2027-01-01",
    );
    assert.equal(
      soonestExpiry(
        ready({ background_check_expires_on: null, suitability_expires_on: "2027-01-01" }),
      ),
      "2027-01-01",
    );
    assert.equal(
      soonestExpiry(
        ready({ background_check_expires_on: "2027-06-01", suitability_expires_on: null }),
      ),
      "2027-06-01",
    );
    assert.equal(
      soonestExpiry(ready({ background_check_expires_on: null, suitability_expires_on: null })),
      null,
    );
    assert.equal(
      soonestExpiry(
        ready({ background_check_expires_on: "2027-06-01", suitability_expires_on: "2027-06-01" }),
      ),
      "2027-06-01",
    );
    assert.equal(
      soonestExpiry(
        readSafeEnvironment({
          ...ready(),
          background_check_expires_on: "",
          suitability_expires_on: "  ",
        }),
      ),
      null,
    );
  });
});

describe("clearanceLabel", () => {
  it("names each status", () => {
    assert.equal(clearanceLabel("not_needed"), "Not needed");
    assert.equal(clearanceLabel("cleared"), "Cleared");
    assert.equal(clearanceLabel("expired"), "Not cleared — expired");
    assert.equal(clearanceLabel("missing"), "Not cleared — missing");
  });
});

describe("safeEnvironmentView", () => {
  it("gives editors the fields and gives viewers nothing", () => {
    const person = ready({ safe_env_program: "  Northtown  " });
    const editor = safeEnvironmentView("editor", person, TODAY);
    assert.equal(editor?.safe_env_program, "Northtown");
    assert.equal(editor?.clearance, "cleared");
    assert.equal(editor?.soonestExpiry, "2027-02-01");
    assert.equal(safeEnvironmentView("admin", person, TODAY)?.works_with_minors, true);
    assert.equal(safeEnvironmentView("viewer", person, TODAY), null);
    assert.equal(safeEnvironmentView("guest", person, TODAY), null);
  });
});

describe("withoutSafeEnvironment", () => {
  it("drops the nine keys and keeps the rest", () => {
    const row = withoutSafeEnvironment({
      id: "ada",
      display_name: "Ada Example",
      works_with_minors: true,
      safe_env_program: "Northtown",
      safe_env_trained_on: "2026-01-15",
      safe_env_diocese: "Example Diocese",
      background_check_on: "2026-02-01",
      background_check_expires_on: "2027-02-01",
      suitability_requested_on: "2026-03-01",
      suitability_received_on: "2026-03-15",
      suitability_expires_on: "2027-03-15",
    });
    assert.deepEqual(row, { id: "ada", display_name: "Ada Example" });
    for (const field of SAFE_ENV_FIELDS) assert.equal(Object.hasOwn(row, field), false);
  });
});

describe("readSafeEnvironment", () => {
  it("treats blanks and impossible dates as empty", () => {
    const read = readSafeEnvironment({
      works_with_minors: true,
      safe_env_program: "  ",
      safe_env_trained_on: "2026-02-31",
      background_check_on: "2026-02-28",
    });
    assert.equal(read.works_with_minors, true);
    assert.equal(read.safe_env_program, null);
    assert.equal(read.safe_env_trained_on, null);
    assert.equal(read.background_check_on, "2026-02-28");
    assert.equal(read.safe_env_diocese, null);
  });
});

describe("changedSafeEnvFields", () => {
  it("lists column names in field order and ignores a blank that matches null", () => {
    const before = ready();
    const after = readSafeEnvironment({
      ...before,
      works_with_minors: false,
      safe_env_diocese: "Other Diocese",
      safe_env_program: "Northtown",
      background_check_on: "",
    });
    assert.deepEqual(changedSafeEnvFields(before, after), [
      "works_with_minors",
      "safe_env_diocese",
      "background_check_on",
    ]);
    assert.deepEqual(
      changedSafeEnvFields(before, ready({ safe_env_program: "  Northtown  " })),
      [],
    );
  });
});

describe("safeEnvToCopy", () => {
  it("returns the other record as one block when the kept record is empty", () => {
    const other = ready({ safe_env_program: " Northtown " });
    assert.deepEqual(safeEnvToCopy(blank(), other), readSafeEnvironment(other));
    assert.deepEqual(
      safeEnvToCopy(blank(), blank({ background_check_on: "2026-02-01" })),
      blank({ background_check_on: "2026-02-01" }),
    );
    assert.deepEqual(
      safeEnvToCopy(blank(), blank({ works_with_minors: true })),
      blank({ works_with_minors: true }),
    );
  });

  it("keeps the kept record when it already has any field, or the other is empty", () => {
    const other = ready();
    assert.equal(safeEnvToCopy(blank({ works_with_minors: true }), other), null);
    assert.equal(safeEnvToCopy(blank({ safe_env_program: "Northtown" }), other), null);
    assert.equal(safeEnvToCopy(blank({ suitability_expires_on: "2027-01-01" }), other), null);
    assert.equal(safeEnvToCopy(blank(), blank()), null);
    assert.equal(safeEnvToCopy(blank(), blank({ safe_env_program: "   " })), null);
  });
});

describe("sortSafeEnvironment", () => {
  it("puts not cleared first, then the earliest expiry, with empty expiries last", () => {
    const sorted = sortSafeEnvironment([
      { id: "1", display_name: "Dana Example", clearance: "cleared" as const, soonestExpiry: null },
      {
        id: "2",
        display_name: "Ben Example",
        clearance: "expired" as const,
        soonestExpiry: "2027-06-01",
      },
      {
        id: "3",
        display_name: "Cara Example",
        clearance: "cleared" as const,
        soonestExpiry: "2026-12-01",
      },
      {
        id: "4",
        display_name: "Ada Example",
        clearance: "missing" as const,
        soonestExpiry: "2026-11-01",
      },
      { id: "5", display_name: "Eve Example", clearance: "missing" as const, soonestExpiry: null },
    ]);
    assert.deepEqual(
      sorted.map((row) => row.display_name),
      ["Ada Example", "Ben Example", "Eve Example", "Cara Example", "Dana Example"],
    );
  });

  it("sorts the same expiry by name without regard to case", () => {
    const sorted = sortSafeEnvironment([
      { display_name: "ben example", clearance: "expired" as const, soonestExpiry: "2027-01-01" },
      { display_name: "Ada Example", clearance: "missing" as const, soonestExpiry: "2027-01-01" },
    ]);
    assert.deepEqual(
      sorted.map((row) => row.display_name),
      ["Ada Example", "ben example"],
    );
  });
});
