import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { ListSelect } from "@/components/list-select";
import { PartnerPeopleFields } from "@/components/partner-people-fields";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { isSchoolType, orgTypeLabel } from "@/lib/crm/constants";
import {
  addAffiliation,
  getOrganization,
  listPeople,
  logTouch,
  removeAffiliation,
  updateOrganization,
} from "@/lib/crm/actions";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/partners/$orgId")({ component: OrgPage });

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
    street: "",
    street2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "United States",
    website: "",
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
  const [people, setPeople] = useState<Awaited<ReturnType<typeof listPeople>>>([]);

  function load() {
    getOrganization({ data: orgId }).then((d) => {
      setData(d);
      const o = d.org as Record<string, string | number | null>;
      setForm({
        name: String(o.name ?? ""),
        street: String(o.street ?? ""),
        street2: String(o.street2 ?? ""),
        city: String(o.city ?? ""),
        state: String(o.state ?? ""),
        postalCode: String(o.postal_code ?? ""),
        country: String(o.country ?? "United States"),
        website: String(o.website ?? ""),
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
        <p className="text-ink-soft">
          {[o.street, o.street2, o.city, o.state, o.postal_code, o.country].filter(Boolean).join(", ")}
        </p>
        {(o.main_email || o.main_phone) && (
          <p className="text-sm text-muted">{[o.main_email, o.main_phone].filter(Boolean).join(" · ")}</p>
        )}
      </header>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-display text-xl">People of this house</h2>
        <div className="mt-3">
          <PartnerPeopleFields
            people={people}
            attached={data.contacts.map((c) => ({
              personId: c.person_id,
              displayName: c.display_name,
              roleKey: c.role_key,
              affiliationId: c.id,
            }))}
            onAdd={async (personId, roleKey) => {
              try {
                await addAffiliation({ data: { personId, organizationId: orgId, roleKey } });
                load();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not add");
              }
            }}
            onRemove={async (row) => {
              if (!row.affiliationId) return;
              try {
                await removeAffiliation({ data: { id: row.affiliationId } });
                load();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not remove");
              }
            }}
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
        <Field label="Street">
          <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
        </Field>
        <Field label="Apt / suite">
          <Input value={form.street2} onChange={(e) => setForm({ ...form, street2: e.target.value })} />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label="State">
          <ListSelect listKey="state" value={form.state} onChange={(state) => setForm({ ...form, state })} />
        </Field>
        <Field label="Postal code">
          <Input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
        </Field>
        <Field label="Country">
          <ListSelect listKey="country" value={form.country} onChange={(country) => setForm({ ...form, country })} allowEmpty={false} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.mainEmail} onChange={(e) => setForm({ ...form, mainEmail: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={form.mainPhone} onChange={(e) => setForm({ ...form, mainPhone: e.target.value })} />
        </Field>
        <Field label="Website">
          <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
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
        <div className="sm:col-span-2">
          <Field label="Notes">
            <p className="mb-1 text-sm text-ink-soft">For future knowledge. No length limit.</p>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-40" />
          </Field>
        </div>
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
