import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DuplicateHint } from "@/components/duplicate-hint";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ADMISSIONS, OCCASIONS } from "@/lib/crm/constants";
import { createEvent, listEvents, listParishes } from "@/lib/crm/actions";
import { fromDatetimeLocal, nextOccasionLocal } from "@/lib/crm/format";
import { matchEventTitle } from "@/lib/crm/match";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/new")({ component: NewEventPage });

function NewEventPage() {
  return (
    <Gated>
      <NewEventInner />
    </Gated>
  );
}

function NewEventInner() {
  const nav = useNavigate();
  const [typeKey, setTypeKey] = useState<"gold_mass" | "conference">("gold_mass");
  const [occasion, setOccasion] = useState("st_albert");
  const [title, setTitle] = useState(() => {
    const o = OCCASIONS.find((x) => x.key === "st_albert");
    const local = o?.month && o.day ? nextOccasionLocal(o.month, o.day) : nextOccasionLocal(11, 15);
    return `Gold Mass of St. Albert the Great, ${local.slice(0, 4)}`;
  });
  const [startsAt, setStartsAt] = useState(() => nextOccasionLocal(11, 15));
  const [admission, setAdmission] = useState<"free" | "private">("free");
  const [hostId, setHostId] = useState("");
  const [theme, setTheme] = useState("");
  const [companion, setCompanion] = useState("");
  const [parishes, setParishes] = useState<{ id: string; name: string }[]>([]);
  const [events, setEvents] = useState<{ id: string; title: string; status: string }[]>([]);

  useEffect(() => {
    listParishes().then(setParishes);
    listEvents().then(setEvents);
  }, []);

  useEffect(() => {
    if (typeKey !== "gold_mass") return;
    const o = OCCASIONS.find((x) => x.key === occasion);
    if (o?.month && o.day) {
      const local = nextOccasionLocal(o.month, o.day);
      setStartsAt(local);
      setTitle(`Gold Mass of ${o.label}, ${local.slice(0, 4)}`);
    }
  }, [occasion, typeKey]);

  const existing = useMemo(() => matchEventTitle(events, title), [events, title]);

  return (
    <form
      className="mx-auto max-w-lg space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (existing) {
          toast.error(`${existing.title} is already on the calendar.`);
          return;
        }
        try {
          const r = await createEvent({
            data: {
              typeKey,
              title,
              startsAt: startsAt ? fromDatetimeLocal(startsAt) : undefined,
              hostParishId: hostId || undefined,
              venueOrganizationId: hostId || undefined,
              occasion: typeKey === "gold_mass" ? occasion : undefined,
              theme: typeKey === "conference" ? theme : undefined,
              companionEventId: companion || undefined,
              venueDetail: typeKey === "gold_mass" ? "Main church" : undefined,
              admission,
            },
          });
          await nav({ to: "/events/$eventId", params: { eventId: r.id } });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not create");
        }
      }}
    >
      <h1 className="font-display text-3xl">Plan a gathering</h1>
      <Field label="Kind">
        <Select value={typeKey} onChange={(e) => setTypeKey(e.target.value as "gold_mass" | "conference")}>
          <option value="gold_mass">Gold Mass</option>
          <option value="conference">Conference</option>
        </Select>
      </Field>
      {typeKey === "gold_mass" && (
        <Field label="Occasion">
          <Select value={occasion} onChange={(e) => setOccasion(e.target.value)}>
            {OCCASIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      {existing && (
        <DuplicateHint href={`/events/${existing.id}`}>
          {existing.title} is already on the calendar.
        </DuplicateHint>
      )}
      <Field label="Starts">
        <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </Field>
      <Field label="Admission">
        <Select value={admission} onChange={(e) => setAdmission(e.target.value as "free" | "private")}>
          {ADMISSIONS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={typeKey === "gold_mass" ? "Host parish" : "Venue"}>
        <Select value={hostId} onChange={(e) => setHostId(e.target.value)}>
          <option value="">Choose…</option>
          {parishes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      {typeKey === "conference" && (
        <Field label="Theme">
          <Input value={theme} onChange={(e) => setTheme(e.target.value)} />
        </Field>
      )}
      <Field label="Link companion gathering">
        <Select value={companion} onChange={(e) => setCompanion(e.target.value)}>
          <option value="">None</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={Boolean(existing)}>
        Create workspace
      </Button>
    </form>
  );
}
