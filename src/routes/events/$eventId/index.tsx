import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ADMISSIONS, OCCASIONS } from "@/lib/crm/constants";
import { formatWhen, fromDatetimeLocal, toDatetimeLocal } from "@/lib/crm/format";
import {
  addProgramPiece,
  addSession,
  cloneEvent,
  closeDoor,
  exportNametags,
  getEvent,
  listClergy,
  listParishes,
  setTaskStatus,
  updateEvent,
} from "@/lib/crm/actions";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/$eventId/")({ component: EventPage });

function EventPage() {
  return (
    <Gated>
      <EventInner />
    </Gated>
  );
}

function EventInner() {
  const { eventId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getEvent>> | null>(null);
  const [clergy, setClergy] = useState<{ id: string; display_name: string }[]>([]);
  const [parishes, setParishes] = useState<{ id: string; name: string }[]>([]);
  const [pieceKind, setPieceKind] = useState("lecture");
  const [pieceTitle, setPieceTitle] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");

  function load() {
    getEvent({ data: eventId }).then(setData);
    listClergy().then(setClergy);
    listParishes().then(setParishes);
  }
  useEffect(load, [eventId]);
  if (!data) return <p className="text-muted">Loading…</p>;
  const e = data.event as Record<string, string | null>;
  const isGold = e.type_key === "gold_mass";
  const slot = (k: string) => data.slots.find((s) => s.slot_key === k);
  const attending = data.counts.filter((c) => c.guest_status === "attending" || c.guest_status === "attended").reduce((a, c) => a + c.n, 0);
  const declined = data.counts.find((c) => c.guest_status === "declined")?.n ?? 0;
  const waiting = data.counts.filter((c) => c.guest_status === "no_response" || c.guest_status === "invited").reduce((a, c) => a + c.n, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="bronze">{isGold ? "Gold Mass" : "Conference"}</Badge>
            <Badge>{e.status}</Badge>
            <Badge tone={e.admission === "private" ? "warn" : "ok"}>
              {e.admission === "private" ? "Private" : "Free"}
            </Badge>
          </div>
          <h1 className="mt-2 font-display text-3xl">{e.title}</h1>
          <p className="text-ink-soft">
            {e.starts_at ? formatWhen(e.starts_at, "full", e.timezone ?? "America/Denver") : "Date TBA"} · {e.venue_name} {e.venue_detail}
          </p>
          {e.celebrant_name && <p className="text-sm">Celebrant: {e.celebrant_name}</p>}
          {data.companion && (
            <p className="mt-1 text-sm">
              Also that weekend:{" "}
              <Link to="/events/$eventId" params={{ eventId: data.companion.id }} className="text-bronze hover:underline">
                {data.companion.title}
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/events/$eventId/invites" params={{ eventId }}>
            <Button>Invites</Button>
          </Link>
          <Link to="/events/$eventId/check-in" params={{ eventId }}>
            <Button variant="secondary">Check in</Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone="ok">{attending} attending</Badge>
        <Badge>{waiting} no response</Badge>
        <Badge tone="warn">{declined} declined</Badge>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <h2 className="font-display text-xl">Planning</h2>
          <Field label="Status">
            <Select
              value={e.status ?? "planning"}
              onChange={async (ev) => {
                try {
                  await updateEvent({ data: { id: eventId, status: ev.target.value } });
                  load();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not update");
                }
              }}
            >
              {["idea", "planning", "confirmed", "complete", "cancelled"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Admission">
            <Select
              value={e.admission ?? "free"}
              onChange={async (ev) => {
                try {
                  await updateEvent({ data: { id: eventId, admission: ev.target.value as "free" | "private" } });
                  load();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not update");
                }
              }}
            >
              {ADMISSIONS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
          {isGold && (
            <>
              <Field label="When">
                <Input
                  key={e.starts_at ?? "none"}
                  type="datetime-local"
                  defaultValue={e.starts_at ? toDatetimeLocal(e.starts_at, e.timezone ?? "America/Denver") : ""}
                  onBlur={(ev) => {
                    const v = ev.target.value;
                    if (v) {
                      updateEvent({
                        data: { id: eventId, startsAt: fromDatetimeLocal(v, e.timezone ?? "America/Denver") },
                      }).then(load);
                    }
                  }}
                />
              </Field>
              <Field label="Occasion">
                <Select
                  defaultValue={slot("liturgical_occasion")?.text_value ?? "st_albert"}
                  onChange={(ev) => updateEvent({ data: { id: eventId, occasion: ev.target.value } }).then(load)}
                >
                  {OCCASIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Host parish">
                <Select
                  defaultValue={slot("host_parish")?.organization_id ?? e.venue_organization_id ?? ""}
                  onChange={(ev) =>
                    updateEvent({
                      data: { id: eventId, hostParishId: ev.target.value || null, venueOrganizationId: ev.target.value || null },
                    }).then(load)
                  }
                >
                  <option value="">Choose…</option>
                  {parishes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Celebrant">
                <Select
                  defaultValue={e.celebrant_id ?? ""}
                  onChange={(ev) => updateEvent({ data: { id: eventId, celebrantId: ev.target.value || null } }).then(load)}
                >
                  <option value="">Not yet</option>
                  {clergy.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Homilist">
                <Select
                  key={slot("homilist")?.person_id ?? "none"}
                  defaultValue={slot("homilist")?.person_id ?? ""}
                  onChange={(ev) => updateEvent({ data: { id: eventId, homilistId: ev.target.value || null } }).then(load)}
                >
                  <option value="">Same as celebrant</option>
                  {clergy.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label="Internal notes">
            <Textarea
              defaultValue={e.internal_notes ?? ""}
              onBlur={(ev) => updateEvent({ data: { id: eventId, internalNotes: ev.target.value } })}
            />
          </Field>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="font-display text-xl">Checklist</h2>
          <ul className="mt-3 space-y-2">
            {data.tasks.map((t) => (
              <li key={t.id} className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-2 size-5 shrink-0"
                  checked={t.status === "done"}
                  onChange={() =>
                    setTaskStatus({ data: { id: t.id, status: t.status === "done" ? "open" : "done" } }).then(load)
                  }
                />
                <span className={t.status === "done" ? "text-muted line-through" : ""}>
                  {t.title}
                  {t.due_on && <span className="block text-xs text-muted tabular-nums">{t.due_on}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-display text-xl">{isGold ? "Program" : "Sessions"}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.pieces.map((p) => (
            <li key={p.id}>
              {p.kind_key}: {p.title} {p.location ? `· ${p.location}` : ""} {p.speaker_name ? `· ${p.speaker_name}` : ""}
            </li>
          ))}
          {data.sessions.map((s) => (
            <li key={s.id}>{s.title}{s.room ? ` · ${s.room}` : ""}</li>
          ))}
        </ul>
        {isGold ? (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={async (ev) => {
              ev.preventDefault();
              await addProgramPiece({ data: { eventId, kindKey: pieceKind, title: pieceTitle } });
              setPieceTitle("");
              load();
            }}
          >
            <Select value={pieceKind} onChange={(e) => setPieceKind(e.target.value)}>
              <option value="lecture">Lecture</option>
              <option value="reception">Reception</option>
              <option value="dinner">Dinner</option>
            </Select>
            <Input value={pieceTitle} onChange={(e) => setPieceTitle(e.target.value)} placeholder="Title / notes" />
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        ) : (
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (ev) => {
              ev.preventDefault();
              await addSession({ data: { eventId, title: sessionTitle } });
              setSessionTitle("");
              load();
            }}
          >
            <Input value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} placeholder="Session title" required />
            <Button type="submit" variant="secondary">
              Add session
            </Button>
          </form>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            const r = await cloneEvent({ data: { eventId } });
            toast.success(r.warnedCelebrant ? "Cloned. Confirm the celebrant is still in this diocese." : "Cloned for next year.");
            window.location.href = `/events/${r.id}`;
          }}
        >
          Clone for next year
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await closeDoor({ data: eventId });
            toast.success("Remaining yeses marked no-show.");
            load();
          }}
        >
          Close door
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            const r = await exportNametags({ data: eventId });
            const blob = new Blob([r.csv], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = r.filename;
            a.click();
          }}
        >
          Export nametags
        </Button>
        <a href={`/mail/compose?eventId=${eventId}`}>
          <Button variant="ghost">Write a letter</Button>
        </a>
      </div>
    </div>
  );
}
