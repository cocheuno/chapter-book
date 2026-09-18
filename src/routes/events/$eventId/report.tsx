import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { getAttendanceReport } from "@/lib/crm/actions";
import { formatWhen } from "@/lib/crm/format";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/events/$eventId/report")({ component: ReportPage });

function ReportPage() {
  return (
    <Gated>
      <ReportInner />
    </Gated>
  );
}

function ReportInner() {
  const { eventId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getAttendanceReport>> | null>(null);

  useEffect(() => {
    getAttendanceReport({ data: eventId }).then(setData);
  }, [eventId]);
  if (!data) return <p className="text-muted">Loading…</p>;
  const e = data.event;
  const t = data.totals;

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <Link to="/events/$eventId" params={{ eventId }} className="text-sm text-bronze hover:underline">
          Back to workspace
        </Link>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
      </div>
      <header>
        <p className="text-sm text-muted">Attendance report</p>
        <h1 className="font-display text-3xl">{e.title}</h1>
        <p className="text-ink-soft">
          {e.starts_at ? formatWhen(e.starts_at, "full", e.timezone ?? "America/Chicago") : "Date TBA"}
          {e.venue_name ? ` · ${e.venue_name}` : ""}
        </p>
      </header>
      <dl className="grid gap-3 sm:grid-cols-4">
        <Stat label="Attendees" value={t.attendees} />
        <Stat label="Mass" value={t.mass} />
        <Stat label="Dinner" value={t.dinner} />
        <Stat label="Lecture" value={t.lecture} />
      </dl>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-soft">
            <th className="py-2 pr-2 font-medium">Name</th>
            <th className="py-2 pr-2 font-medium tabular-nums">No.</th>
            <th className="py-2 pr-2 font-medium">Mass</th>
            <th className="py-2 pr-2 font-medium">Dinner</th>
            <th className="py-2 pr-2 font-medium">Lecture</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((p) => (
            <tr key={p.id} className="border-b border-line">
              <td className="py-2 pr-2">{p.display_name}</td>
              <td className="py-2 pr-2 tabular-nums">{p.party_size}</td>
              <td className="py-2 pr-2">{p.coming_to_mass ? "Yes" : "—"}</td>
              <td className="py-2 pr-2">{p.coming_to_dinner ? "Yes" : "—"}</td>
              <td className="py-2 pr-2">{p.coming_to_lecture ? "Yes" : "—"}</td>
              <td className="py-2">{(p.guest_status ?? "").replaceAll("_", " ")}</td>
            </tr>
          ))}
          {data.rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-muted">
                No registrations yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="font-display text-3xl tabular-nums">{value}</dd>
    </div>
  );
}
