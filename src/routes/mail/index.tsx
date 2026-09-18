import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listMail } from "@/lib/crm/actions";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/mail/")({ component: MailPage });

function MailPage() {
  return (
    <Gated>
      <MailInner />
    </Gated>
  );
}

function MailInner() {
  const [data, setData] = useState<Awaited<ReturnType<typeof listMail>> | null>(null);
  useEffect(() => {
    listMail().then(setData);
  }, []);
  if (!data) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Mail</h1>
          <p className="text-ink-soft">
            From {data.mailbox.fromName}
            {data.mailbox.fromAddress ? ` · ${data.mailbox.fromAddress}` : ""}
          </p>
        </div>
        <a href="/mail/compose">
          <Button>New letter</Button>
        </a>
      </div>
      <section>
        <h2 className="mb-2 font-display text-xl">Sent</h2>
        {data.mailings.length === 0 && <p className="text-muted">No letters yet. Start from a Gold Mass template.</p>}
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {data.mailings.map((m) => (
            <li key={m.id}>
              <Link to="/mail/$mailingId" params={{ mailingId: m.id }} className="block px-4 py-3 hover:bg-paper-2">
                <span className="font-medium">{m.subject_snapshot || "(no subject)"}</span>
                <span className="ml-2 text-sm text-muted">
                  {m.audience_count ?? 0} · {m.status}
                  {m.event_title ? ` · ${m.event_title}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 font-display text-xl">Templates</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.templates.map((t) => (
            <li key={t.id} className="rounded-lg border border-line bg-surface px-4 py-3">
              <p className="font-medium">{t.name}</p>
              <p className="text-sm text-muted">{t.audience_hint.replaceAll("_", " ")}</p>
              <Badge tone="muted">{t.key}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
