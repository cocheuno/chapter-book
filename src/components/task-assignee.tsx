type Choice = { userId: string; name: string };

/** Small editor control. The first option clears the assignee. */
export function TaskAssigneeSelect({
  assigneeId,
  assigneeName,
  assignees,
  onChange,
}: {
  assigneeId: string | null;
  assigneeName: string | null;
  assignees: Choice[];
  onChange: (userId: string | null) => void;
}) {
  const options = assignees.slice();
  if (assigneeId && !options.some((row) => row.userId === assigneeId)) {
    options.push({ userId: assigneeId, name: assigneeName || "Assigned" });
  }
  return (
    <label className="inline-flex items-center gap-1 text-xs text-muted">
      <span>Assign</span>
      <select
        aria-label="Assign"
        className="h-8 max-w-44 rounded-md border border-line bg-surface px-1 text-xs text-ink"
        value={assigneeId ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">— Unassigned —</option>
        {options.map((row) => (
          <option key={row.userId} value={row.userId}>
            {row.name || row.userId}
          </option>
        ))}
      </select>
    </label>
  );
}
