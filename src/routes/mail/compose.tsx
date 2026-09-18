import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { listEvents, listMail, markNotifySchools, previewMail, sendMail } from "@/lib/crm/actions";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/mail/compose")({
  validateSearch: (s: Record<string, unknown>): { eventId?: string } => ({
    eventId: typeof s.eventId === "string" ? s.eventId : undefined,
  }),
  component: ComposePage,
});

function ComposePage() {
  return (
    <Gated>
      <ComposeInner />
    </Gated>
  );
}

function ComposeInner() {
  const search = Route.useSearch();
  const nav = useNavigate();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listMail>>["templates"]>([]);
  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [eventId, setEventId] = useState(search.eventId ?? "");
  const [source, setSource] = useState("school_doors");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewMail>> | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listMail().then((d) => {
      setTemplates(d.templates);
      const school = d.templates.find((t) => t.key === "school_faculty_invite");
      if (school) setTemplateId(school.id);
    });
    listEvents().then(setEvents);
  }, []);

  async function runPreview() {
    const p = await previewMail({ data: { templateId, eventId: eventId || undefined, audienceSource: source } });
    setPreview(p);
    setTyped("");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-display text-3xl">New letter</h1>
      <Field label="Template">
        <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="About gathering">
        <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">None</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="To">
        <Select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="school_doors">School preferred doors</option>
          <option value="parish_secretaries">Parish secretaries</option>
          <option value="event_guests">Event guests</option>
          <option value="members">Members</option>
        </Select>
      </Field>
      <Button type="button" variant="secondary" onClick={runPreview} disabled={!templateId}>
        Preview
      </Button>
      {preview && (
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">
            {preview.audienceCount} people. {preview.skips.length} skipped.
            {preview.previewAs ? ` Preview as ${preview.previewAs}.` : ""}
            {preview.frontOffice > 0 ? ` ${preview.frontOffice} front-office addresses.` : ""}
          </p>
          {preview.skips.length > 0 && (
            <ul className="text-sm text-danger">
              {preview.skips.map((s) => (
                <li key={s.id}>
                  {s.name} — {s.reason.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
          )}
          <p className="font-medium">{preview.subject}</p>
          <pre className="overflow-x-auto font-sans text-sm whitespace-pre-wrap text-ink-soft">{preview.body}</pre>
          <ul className="max-h-40 overflow-auto text-sm">
            {preview.recipients.map((r) => (
              <li key={r.address + r.name}>
                {r.name} · {r.address}
                {r.kind !== "person" ? " · front office" : ""}
              </li>
            ))}
          </ul>
          <Field label={`Type ${preview.audienceCount} to confirm`}>
            <Input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
          <Button
            disabled={busy || Number(typed) !== preview.audienceCount || preview.audienceCount < 1}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await sendMail({
                  data: {
                    templateId,
                    eventId: eventId || undefined,
                    audienceSource: source,
                    typedCount: Number(typed),
                  },
                });
                toast.success(`Recorded ${r.sent} letters in the mailroom.`);
                if (r.checklistPrompt && eventId) {
                  if (confirm("Mark Notify Catholic high-school science chairs done?")) {
                    await markNotifySchools({ data: eventId });
                  }
                }
                await nav({ to: "/mail/$mailingId", params: { mailingId: r.mailingId } });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not send");
              } finally {
                setBusy(false);
              }
            }}
          >
            Send
          </Button>
        </div>
      )}
    </div>
  );
}
