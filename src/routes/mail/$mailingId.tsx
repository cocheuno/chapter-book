import { createFileRoute } from "@tanstack/react-router";
import { Crumbs } from "@/components/crumbs";
import { Gated } from "@/components/gate";
import { Badge } from "@/components/ui/badge";
import { getMailing } from "@/lib/crm/actions";
import { rememberVisit, useListHref } from "@/lib/nav/nav-store";
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
  const mailHref = useListHref("mail", "/mail");
  const [data, setData] = useState<Awaited<ReturnType<typeof getMailing>> | null>(null);
  useEffect(() => {
    getMailing({ data: mailingId }).then(setData);
  }, [mailingId]);
  useEffect(() => {
    if (!data) return;
    const subject = String((data.mailing as { subject_snapshot?: string | null }).subject_snapshot ?? "").trim();
    rememberVisit({
      kind: "letter",
      id: mailingId,
      label: subject || "(no subject)",
      href: `/mail/${mailingId}`,
    });
  }, [data, mailingId]);
  if (!data) return <p className="text-muted">Loading…</p>;
  const m = data.mailing as Record<string, string | number | null>;
  const subject = String(m.subject_snapshot ?? "").trim();
  return (
    <div className="space-y-6">
      <Crumbs trail={[{ label: "Mail", to: mailHref }, { label: subject || "(no subject)" }]} />
      <header>
        <Badge>{String(m.status)}</Badge>
        <h1 className="mt-2 font-display text-3xl">{subject || "(no subject)"}</h1>
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
