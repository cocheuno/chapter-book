import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Badge } from "@/components/ui/badge";
import { getMailing } from "@/lib/crm/actions";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/mail/$mailingId")({ component: MailingPage });

function MailingPage() {
  return (
    <Gated>
      <MailingInner />
    </Gated>
  );
}

function MailingInner() {
  const { mailingId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getMailing>> | null>(null);
  useEffect(() => {
    getMailing({ data: mailingId }).then(setData);
  }, [mailingId]);
  if (!data) return <p className="text-muted">Loading…</p>;
  const m = data.mailing as Record<string, string | number | null>;
  return (
    <div className="space-y-6">
      <Link to="/mail" className="text-sm text-bronze hover:underline">
        All mail
      </Link>
      <header>
        <Badge>{String(m.status)}</Badge>
        <h1 className="mt-2 font-display text-3xl">{String(m.subject_snapshot)}</h1>
        <p className="text-muted">{m.audience_count} sent</p>
      </header>
      <pre className="rounded-xl border border-line bg-surface p-4 font-sans text-sm whitespace-pre-wrap">
        {String(m.body_snapshot ?? "")}
      </pre>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {data.messages.map((msg) => (
          <li key={msg.address} className="px-4 py-3 text-sm">
            {msg.person_name ?? msg.org_name ?? msg.address} · {msg.address} · {msg.recipient_kind} · {msg.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
