import { createFileRoute, Link } from "@tanstack/react-router";
import { DuplicateHint } from "@/components/duplicate-hint";
import { Gated } from "@/components/gate";
import { ListSelect } from "@/components/list-select";
import { PersonNameFields, type PersonNameValue } from "@/components/person-name-fields";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  addableOffices,
  isReligiousPerson,
  isSchoolType,
  isSingularOffice,
  officesForType,
  orgTypeLabel,
  personRolesFromDesk,
  roleLabel,
  type DeskKind,
} from "@/lib/crm/constants";
import {
  addAffiliation,
  createPerson,
  getOrganization,
  listPeople,
  logTouch,
  removeAffiliation,
  updateOrganization,
} from "@/lib/crm/actions";
import { composePersonName } from "@/lib/crm/names";
import { matchPerson } from "@/lib/crm/match";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/partners/$orgId")({ component: OrgPage });

type PersonRow = Awaited<ReturnType<typeof listPeople>>[number];
type Contact = Awaited<ReturnType<typeof getOrganization>>["contacts"][number];

function OrgPage() {
  return (
    <Gated>
      <OrgInner />
    </Gated>
  );
}

function OrgInner() {
  const { orgId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getOrganization>> | null>(null);
  const [form, setForm] = useState({
    name: "",
    city: "",
    state: "",
    country: "United States",
    mainEmail: "",
    mainPhone: "",
    bulletinDeadline: "",
    hallNotes: "",
    parkingNotes: "",
    liturgicalNotes: "",
    typicalMassTimes: "",
    preferredDoor: "science_chair",
    scienceDeptNotes: "",
    canBus: "",
    calendarNotes: "",
    notes: "",
  });
  const [touch, setTouch] = useState("");
  const [people, setPeople] = useState<PersonRow[]>([]);

  function load() {
    getOrganization({ data: orgId }).then((d) => {
      setData(d);
      const o = d.org as Record<string, string | number | null>;
      setForm({
        name: String(o.name ?? ""),
        city: String(o.city ?? ""),
        state: String(o.state ?? ""),
        country: String(o.country ?? "United States"),
        mainEmail: String(o.main_email ?? ""),
        mainPhone: String(o.main_phone ?? ""),
        bulletinDeadline: String(o.bulletin_deadline ?? ""),
        hallNotes: String(o.hall_notes ?? ""),
        parkingNotes: String(o.parking_notes ?? ""),
        liturgicalNotes: String(o.liturgical_notes ?? ""),
        typicalMassTimes: String(o.typical_mass_times ?? ""),
        preferredDoor: String(o.preferred_door ?? "science_chair"),
        scienceDeptNotes: String(o.science_dept_notes ?? ""),
        canBus: String(o.can_bus_students ?? ""),
        calendarNotes: String(o.academic_calendar_notes ?? ""),
        notes: String(o.notes ?? ""),
      });
    });
    listPeople({ data: undefined }).then(setPeople);
  }
  useEffect(load, [orgId]);
  if (!data) return <p className="text-muted">Loading…</p>;
  const o = data.org as Record<string, string | number | null>;
  const typeKey = String(o.type_key);
  const isParish = typeKey === "parish";
  const isSchool = isSchoolType(typeKey);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">
          {orgTypeLabel(typeKey)}
          {o.diocese_name ? ` · ${o.diocese_name}` : ""}
        </p>
        <h1 className="font-display text-3xl">{String(o.name)}</h1>
        <p className="text-ink-soft">{[o.city, o.state, o.country].filter(Boolean).join(", ")}</p>
      </header>

      <section>
        <h2 className="font-display text-xl">People of this house</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Religious and laity from the book. Add a new name here if they are not in People yet.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <DeskColumn
            kind="religious"
            title="Religious"
            typeKey={typeKey}
            orgId={orgId}
            contacts={data.contacts}
            people={people}
            onChange={load}
          />
          <DeskColumn
            kind="laity"
            title="Laity"
            typeKey={typeKey}
            orgId={orgId}
            contacts={data.contacts}
            people={people}
            onChange={load}
          />
        </div>
      </section>

      <form
        className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await updateOrganization({ data: { id: orgId, ...form } });
            toast.success("Saved");
            load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save");
          }
        }}
      >
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label="State">
          <ListSelect listKey="state" value={form.state} onChange={(state) => setForm({ ...form, state })} />
        </Field>
        <Field label="Country">
          <ListSelect listKey="country" value={form.country} onChange={(country) => setForm({ ...form, country })} allowEmpty={false} />
        </Field>
        <Field label="Front office email">
          <Input value={form.mainEmail} onChange={(e) => setForm({ ...form, mainEmail: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.mainPhone} onChange={(e) => setForm({ ...form, mainPhone: e.target.value })} />
        </Field>
        {isParish && (
          <>
            <Field label="Bulletin deadline">
              <Input value={form.bulletinDeadline} onChange={(e) => setForm({ ...form, bulletinDeadline: e.target.value })} />
            </Field>
            <Field label="Typical Mass times">
              <Input value={form.typicalMassTimes} onChange={(e) => setForm({ ...form, typicalMassTimes: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Hall notes">
                <Textarea value={form.hallNotes} onChange={(e) => setForm({ ...form, hallNotes: e.target.value })} />
              </Field>
            </div>
          </>
        )}
        {isSchool && (
          <>
            <Field label="Preferred door">
              <Select value={form.preferredDoor} onChange={(e) => setForm({ ...form, preferredDoor: e.target.value })}>
                <option value="science_chair">Science chair</option>
                <option value="campus_minister">Campus minister</option>
                <option value="principal">Principal</option>
                <option value="front_office">Front office</option>
              </Select>
            </Field>
            <Field label="Can bus students">
              <Input value={form.canBus} onChange={(e) => setForm({ ...form, canBus: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Science department">
                <Textarea value={form.scienceDeptNotes} onChange={(e) => setForm({ ...form, scienceDeptNotes: e.target.value })} />
              </Field>
            </div>
          </>
        )}
        <Button type="submit">Save</Button>
      </form>

      {data.children.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-xl">In this diocese</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.children.map((c) => (
              <li key={c.id}>
                <Link to="/partners/$orgId" params={{ orgId: c.id }} className="block px-4 py-3 hover:bg-paper-2">
                  {c.name} <span className="text-sm text-muted">· {orgTypeLabel(c.type_key)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.groups.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-xl">Groups at our gatherings</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.groups.map((g) => (
              <li key={g.event_id} className="px-4 py-3">
                <Link to="/events/$eventId" params={{ eventId: g.event_id }} className="text-bronze hover:underline">
                  {g.title}
                </Link>
                <span className="text-sm text-muted">
                  {" "}
                  · {g.lead_name ?? "group"} · party {g.party_size}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-display text-xl">Hosted</h2>
        <ul className="space-y-1">
          {data.hosted.map((h) => (
            <li key={h.id}>
              <Link to="/events/$eventId" params={{ eventId: h.id }} className="text-bronze hover:underline">
                {h.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {isSchool && (
        <a href="/mail/compose">
          <Button>Email this school</Button>
        </a>
      )}

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await logTouch({ data: { organizationId: orgId, kind: "call", summary: touch } });
          toast.success("Touch logged");
          setTouch("");
        }}
      >
        <Input value={touch} onChange={(e) => setTouch(e.target.value)} placeholder="Log a touch" required />
        <Button type="submit" variant="secondary">
          Log
        </Button>
      </form>
    </div>
  );
}

function DeskColumn({
  kind,
  title,
  typeKey,
  orgId,
  contacts,
  people,
  onChange,
}: {
  kind: DeskKind;
  title: string;
  typeKey: string;
  orgId: string;
  contacts: Contact[];
  people: PersonRow[];
  onChange: () => void;
}) {
  const offices = officesForType(typeKey, kind);
  const officeKeys = new Set(offices.map((o) => o.key));
  const extras = contacts.filter((c) => {
    const inThisKind = addableOffices(typeKey, kind).some((o) => o.key === c.role_key);
    return inThisKind && !officeKeys.has(c.role_key);
  });

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h3 className="font-display text-lg">{title}</h3>
      <ul className="mt-3 divide-y divide-line">
        {offices.map((office) => {
          const holders = contacts.filter((c) => c.role_key === office.key);
          return (
            <li key={office.key} className="py-2">
              <p className="text-sm text-muted">{office.label}</p>
              {holders.length === 0 ? (
                <p className="min-h-11 text-ink-soft">Not on file</p>
              ) : (
                holders.map((c) => (
                  <div key={c.id} className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-3">
                    <p className="min-w-0">
                      <Link to="/people/$personId" params={{ personId: c.person_id }} className="text-bronze hover:underline">
                        {c.display_name}
                      </Link>
                      {c.email ? <span className="ml-2 text-sm text-muted">· {c.email}</span> : null}
                    </p>
                    <button
                      type="button"
                      className="shrink-0 text-sm text-danger hover:underline"
                      onClick={async () => {
                        await removeAffiliation({ data: { id: c.id } });
                        onChange();
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </li>
          );
        })}
        {extras.map((c) => (
          <li key={c.id} className="flex min-h-11 items-start justify-between gap-3 py-2">
            <div>
              <p className="text-sm text-muted">{roleLabel(c.role_key)}</p>
              <p>
                <Link to="/people/$personId" params={{ personId: c.person_id }} className="text-bronze hover:underline">
                  {c.display_name}
                </Link>
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-sm text-danger hover:underline"
              onClick={async () => {
                await removeAffiliation({ data: { id: c.id } });
                onChange();
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <AddToDesk kind={kind} typeKey={typeKey} orgId={orgId} people={people} contacts={contacts} onAdded={onChange} />
    </div>
  );
}

function AddToDesk({
  kind,
  typeKey,
  orgId,
  people,
  contacts,
  onAdded,
}: {
  kind: DeskKind;
  typeKey: string;
  orgId: string;
  people: PersonRow[];
  contacts: Contact[];
  onAdded: () => void;
}) {
  const roles = addableOffices(typeKey, kind);
  const [personId, setPersonId] = useState("");
  const [roleKey, setRoleKey] = useState(roles[0]?.key ?? "other");
  const [name, setName] = useState<PersonNameValue>({
    religiousTitle: "",
    academicTitle: "",
    givenName: "",
    middleName: "",
    familyName: "",
    suffix: "",
  });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const religious = people.filter((p) => isReligiousPerson(p.roles));
    const laity = people.filter((p) => !religious.some((r) => r.id === p.id));
    return { religious, laity };
  }, [people]);
  const takenPeople = useMemo(() => new Set(contacts.map((c) => c.person_id)), [contacts]);
  const holderByOffice = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts) {
      if (!map.has(c.role_key)) map.set(c.role_key, c.display_name);
    }
    return map;
  }, [contacts]);
  const newHit = useMemo(() => {
    if (personId !== "__new__") return { hard: null, soft: null };
    const listed = composePersonName(name);
    return matchPerson(people, listed || `${name.givenName} ${name.familyName}`, email);
  }, [personId, people, name, email]);

  useEffect(() => {
    setRoleKey((current) => {
      if (current && !(isSingularOffice(current) && holderByOffice.has(current))) return current;
      const open = roles.find((r) => !isSingularOffice(r.key) || !holderByOffice.has(r.key));
      return open?.key ?? "other";
    });
  }, [typeKey, kind, contacts]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const isNew = personId === "__new__";
      let id = isNew ? "" : personId;
      if (!id) {
        if (!isNew || !name.givenName.trim() || !name.familyName.trim()) {
          toast.error("Choose someone from the book, or add a first and last name.");
          return;
        }
        const r = await createPerson({
          data: {
            givenName: name.givenName.trim(),
            familyName: name.familyName.trim(),
            middleName: name.middleName,
            suffix: name.suffix,
            email,
            religiousTitle: kind === "religious" ? name.religiousTitle : undefined,
            academicTitle: name.academicTitle || undefined,
            roles: personRolesFromDesk(kind, roleKey, name.religiousTitle),
          },
        });
        id = r.id;
        if (r.duplicate) {
          if (takenPeople.has(r.id)) {
            toast.error(`${r.name} is already on file here.`);
            return;
          }
          toast.message(`${r.name} is already in the book. Attaching that person.`);
        }
      } else if (takenPeople.has(id)) {
        const existing = contacts.find((c) => c.person_id === id);
        toast.error(
          `${existing?.display_name ?? "That person"} is already ${roleLabel(existing?.role_key ?? "on file")} here.`,
        );
        return;
      }
      if (isSingularOffice(roleKey) && holderByOffice.has(roleKey) && holderByOffice.get(roleKey)) {
        const holder = holderByOffice.get(roleKey);
        toast.error(`${roleLabel(roleKey)} is already ${holder}. Remove them first if this is a change.`);
        return;
      }
      await addAffiliation({
        data: {
          personId: id,
          organizationId: orgId,
          roleKey,
          isPrimary: ["pastor", "bishop", "science_chair", "principal"].includes(roleKey),
        },
      });
      toast.success("Added");
      setPersonId("");
      setName({
        religiousTitle: "",
        academicTitle: "",
        givenName: "",
        middleName: "",
        familyName: "",
        suffix: "",
      });
      setEmail("");
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  function personOption(p: PersonRow) {
    const taken = takenPeople.has(p.id);
    const office = contacts.find((c) => c.person_id === p.id);
    return (
      <option key={p.id} value={p.id} disabled={taken}>
        {taken ? `${p.display_name} (${roleLabel(office?.role_key ?? "on file")})` : p.display_name}
      </option>
    );
  }

  return (
    <form className="mt-4 space-y-2 border-t border-line pt-4" onSubmit={submit}>
      <p className="text-sm font-medium text-ink-soft">{kind === "religious" ? "Add religious" : "Add laity"}</p>
      <Field label="Person">
        <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">From the book…</option>
          <option value="__new__">New person…</option>
          <optgroup label="Religious in the book">{grouped.religious.map(personOption)}</optgroup>
          <optgroup label="Laity in the book">{grouped.laity.map(personOption)}</optgroup>
        </Select>
      </Field>
      <Field label="Office">
        <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
          {roles.map((r) => {
            const holder = isSingularOffice(r.key) ? holderByOffice.get(r.key) : undefined;
            return (
              <option key={r.key} value={r.key} disabled={Boolean(holder)}>
                {holder ? `${r.label} — ${holder}` : r.label}
              </option>
            );
          })}
        </Select>
      </Field>
      {personId === "__new__" && (
        <>
          <PersonNameFields
            value={name}
            onChange={setName}
            includeTitles={kind === "religious"}
          />
          {kind !== "religious" && (
            <Field label="Academic title">
              <ListSelect listKey="academic_title" value={name.academicTitle} onChange={(academicTitle) => setName({ ...name, academicTitle })} />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" />
          </Field>
          {newHit.hard && (
            <DuplicateHint href={`/people/${newHit.hard.id}`}>
              {takenPeople.has(newHit.hard.id)
                ? `${newHit.hard.name} is already on file here.`
                : `${newHit.hard.name} is already in the book. We will attach that person.`}
            </DuplicateHint>
          )}
          {newHit.soft && (
            <DuplicateHint href={`/people/${newHit.soft.id}`}>
              There is already a {newHit.soft.name}. If this is the same person, pick them from the book.
            </DuplicateHint>
          )}
        </>
      )}
      <Button type="submit" variant="secondary" disabled={busy || Boolean(newHit.hard && takenPeople.has(newHit.hard.id))}>
        Add
      </Button>
    </form>
  );
}
