/** Display name for an operator: the user's name, or the email when the name is blank. */
export function assigneeName(name: string | null | undefined, email: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) return trimmed;
  return (email ?? "").trim();
}

export type AssigneeRow = {
  assignee_user_id: string | null;
  assignee_user_name: string | null;
  assignee_email: string | null;
};

/** Drops the raw name and email and keeps one label. */
export function withAssignee<T extends AssigneeRow>(row: T): Omit<T, "assignee_user_name" | "assignee_email"> & {
  assignee_name: string | null;
} {
  const { assignee_user_name, assignee_email, ...rest } = row;
  const label = assigneeName(assignee_user_name, assignee_email);
  return { ...rest, assignee_name: label || null };
}

/** Enabled operators, labeled and ordered by that label. */
export function assigneeChoices(
  rows: { userId: string; name: string | null; email: string | null }[],
): { userId: string; name: string }[] {
  return rows
    .map((row) => ({ userId: row.userId, name: assigneeName(row.name, row.email) }))
    .sort(
      (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.userId.localeCompare(b.userId),
    );
}
