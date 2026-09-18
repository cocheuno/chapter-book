import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listEvents } from "@/lib/crm/actions";
import { formatWhen } from "@/lib/crm/format";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/events/")({ component: EventsPage });

function EventsPage() {
  return (
    <Gated>
      <EventsInner />
    </Gated>
  );
}

function EventsInner() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listEvents>>>([]);
  useEffect(() => {
    listEvents().then(setRows);
  }, []);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Gatherings</h1>
          <p className="text-ink-soft">Gold Masses and conferences.</p>
        </div>
        <Link to="/events/new">
          <Button>Plan a gathering</Button>
        </Link>
      </div>
      {rows.length === 0 && (
        <p className="text-muted">No gathering on the books. Plan a Gold Mass.</p>
      )}
      <ul className="grid gap-2">
        {rows.map((e) => (
          <li key={e.id}>
            <Link
              to="/events/$eventId"
              params={{ eventId: e.id }}
              className="block rounded-xl border border-line bg-surface px-4 py-3 hover:bg-paper-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{e.title}</p>
                <Badge tone={e.type_key === "gold_mass" ? "bronze" : "muted"}>
                  {e.type_key === "gold_mass" ? "Gold Mass" : "Conference"}
                </Badge>
                <Badge>{e.status}</Badge>
                <Badge tone={e.admission === "private" ? "warn" : "ok"}>
                  {e.admission === "private" ? "Private" : "Free"}
                </Badge>
              </div>
              <p className="text-sm text-muted">
                {e.starts_at ? formatWhen(e.starts_at, "date") : "Date TBA"}
                {e.venue_name ? ` · ${e.venue_name}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
