import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assigneeChoices, assigneeName, withAssignee } from "./task-assign-rules.ts";

describe("assigneeName", () => {
  it("uses the name, and the email when the name is blank", () => {
    assert.equal(assigneeName("Ada Example", "ada@example.com"), "Ada Example");
    assert.equal(assigneeName("  Ada Example  ", "ada@example.com"), "Ada Example");
    assert.equal(assigneeName("  ", "ada@example.com"), "ada@example.com");
    assert.equal(assigneeName(null, "ada@example.com"), "ada@example.com");
    assert.equal(assigneeName("Ada Example", null), "Ada Example");
    assert.equal(assigneeName(" ", " "), "");
  });
});

describe("withAssignee", () => {
  it("keeps one label and drops the raw name and email", () => {
    const row = withAssignee({
      id: "t1",
      assignee_user_id: "u1",
      assignee_user_name: " ",
      assignee_email: "ada@example.com",
    });
    assert.deepEqual(row, { id: "t1", assignee_user_id: "u1", assignee_name: "ada@example.com" });
    assert.equal("assignee_email" in row, false);
  });
});

describe("assigneeChoices", () => {
  it("orders by the label, using the email when the name is blank", () => {
    assert.deepEqual(
      assigneeChoices([
        { userId: "b", name: "Bea Example", email: "bea@example.com" },
        { userId: "a", name: " ", email: "ada@example.com" },
      ]),
      [
        { userId: "a", name: "ada@example.com" },
        { userId: "b", name: "Bea Example" },
      ],
    );
  });
});
