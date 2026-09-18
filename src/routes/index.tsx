import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getHome } from "@/lib/crm/actions";
import { formatWhen } from "@/lib/crm/format";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  return (
    <Gated>
      <HomeInner />
    </Gated>
  );
}

function HomeInner() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getHome>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getHome()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load"));
  }, []);
  if (err) return <p className="text-danger">{err}</p>;
  if (!data) return <p className="text-muted">Gathering the chapter…</p>;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm tracking-wide text-muted uppercase">{data.member.chapterName}</p>
        <h1 className="font-display text-3xl">Home</h1>
      </header>

      {data.nextEvent ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <p className="text-xs tracking-wide text-muted uppercase">Next gathering</p>
          <h2 className="mt-1 font-display text-2xl">{data.nextEvent.title}</h2>
          <p className="mt-1 text-ink-soft">
            {data.nextEvent.starts_at ? formatWhen(data.nextEvent.starts_at, "short") : "Date TBA"}
            {data.nextEvent.venue_name ? ` · ${data.nextEvent.venue_name}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Badge tone="ok">{data.rsvp.attending} attending</Badge>
            <Badge>{data.rsvp.notAnswered} no response</Badge>
            <Badge tone="warn">{data.rsvp.declined} declined</Badge>
            <Badge tone="bronze">{data.openChecklist} open tasks</Badge>
          </div>
          {data.nextEvent.celebrant_name && (
            <p className="mt-2 text-sm text-muted">Celebrant: {data.nextEvent.celebrant_name}</p>
          )}
          <div className="mt-4">
            <Link to="/events/$eventId" params={{ eventId: data.nextEvent.id }}>
              <Button>Open workspace</Button>
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-line p-6">
          <p className="font-display text-xl">No gathering on the books.</p>
          <Link to="/events/new" className="mt-3 inline-block">
            <Button>Plan a Gold Mass</Button>
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-xl">Due this week</h2>
        </div>
        {data.tasks.length === 0 ? (
          <p className="text-muted">Nothing due. Enjoy ordinary time.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.tasks.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
                <span>{t.title}</span>
                <span className="text-sm text-muted tabular-nums">{t.due_on ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl">Quiet schools this year</h2>
        {data.quietSchools.length === 0 ? (
          <p className="text-muted">Every school partner has been touched since August.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.quietSchools.map((s) => (
              <li key={s.id}>
                <Link
                  to="/partners/$orgId"
                  params={{ orgId: s.id }}
                  className="block rounded-lg border border-line bg-surface px-4 py-3 hover:bg-paper-2"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {s.has_chair ? s.city : "No science chair on file"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
