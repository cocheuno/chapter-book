import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { listActivity } from "@/lib/crm/audit";
import type { AuditGroup } from "@/lib/crm/audit-rules";
import { formatWhen } from "@/lib/crm/format";
import { getSessionContext } from "@/lib/crm/member";

export const Route = createFileRoute("/chapter/activity")({ component: ActivityPage });

const GROUPS: { value: "" | AuditGroup; label: string }[] = [
  { value: "", label: "All" },
  { value: "operators", label: "Operators" },
  { value: "website", label: "Website" },
  { value: "registration", label: "Registration" },
  { value: "exports", label: "Exports" },
  { value: "mail", label: "Mail" },
  { value: "chapter", label: "Chapter" },
];

type ActivityRow = Awaited<ReturnType<typeof listActivity>>["rows"][number];

function ActivityPage() {
  return (
    <Gated>
      <ActivityInner />
    </Gated>
  );
}

function ActivityInner() {
  const [role, setRole] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("America/Denver");
  const [group, setGroup] = useState<"" | AuditGroup>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  function filters() {
    return {
      group: group || undefined,
      from: from || undefined,
      to: to || undefined,
    };
  }

  useEffect(() => {
    getSessionContext().then((session) => {
      setRole(session.role);
      setTimezone(session.timezone);
      if (session.role !== "admin") {
        setReady(true);
        return;
      }
      listActivity({ data: {} })
        .then((page) => {
          setRows(page.rows);
          setHasMore(page.hasMore);
        })
        .finally(() => setReady(true));
    });
  }, []);

  if (!ready || role == null) return <p className="text-muted">Loading…</p>;
  if (role !== "admin") return <p>Only an admin can see activity.</p>;

  async function show() {
    setBusy(true);
    try {
      const page = await listActivity({ data: filters() });
      setRows(page.rows);
      setHasMore(page.hasMore);
    } finally {
      setBusy(false);
    }
  }

  async function older() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setBusy(true);
    try {
      const page = await listActivity({
        data: { ...filters(), before: { at: last.at, id: last.id } },
      });
      setRows((current) => [...current, ...page.rows]);
      setHasMore(page.hasMore);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link to="/chapter" className="text-sm text-bronze hover:underline">
          Back to Chapter
        </Link>
        <h1 className="font-display text-3xl">Activity</h1>
      </div>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void show();
        }}
      >
        <Field label="What">
          <Select value={group} onChange={(event) => setGroup(event.target.value as "" | AuditGroup)}>
            {GROUPS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Button type="submit" disabled={busy}>
          Show
        </Button>
      </form>
      {rows.length === 0 ? (
        <p>No activity yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-ink-soft">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Who</th>
                <th className="py-2 pr-3 font-medium">What</th>
                <th className="py-2 pr-3 font-medium">Details</th>
                <th className="py-2 font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatWhen(row.at, "short", timezone)}</td>
                  <td className="py-2 pr-3">{row.who}</td>
                  <td className="py-2 pr-3">{row.label}</td>
                  <td className="py-2 pr-3">{row.summary}</td>
                  <td className="py-2">
                    {row.href ? (
                      <a href={row.href} className="text-bronze hover:underline">
                        Open
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore ? (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void older()}>
          Show older
        </Button>
      ) : null}
    </div>
  );
}
