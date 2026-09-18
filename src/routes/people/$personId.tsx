import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { PersonNameFields, type PersonNameValue } from "@/components/person-name-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ListSelect } from "@/components/list-select";
import { PersonPartnersFields } from "@/components/person-partners-fields";
import { roleLabel } from "@/lib/crm/constants";
import { addAffiliation, getPerson, listPartners, logTouch, removeAffiliation, updatePerson } from "@/lib/crm/actions";
import { listedName } from "@/lib/crm/names";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/people/$personId")({ component: PersonPage });

function PersonPage() {
  return (
    <Gated>
      <PersonInner />
    </Gated>
  );
}

function PersonInner() {
  const { personId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getPerson>> | null>(null);
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState("call");
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState<PersonNameValue>({
    religiousTitle: "",
    academicTitle: "",
    givenName: "",
    middleName: "",
    familyName: "",
    suffix: "",
  });
  const [edit, setEdit] = useState({
    email: "",
    phone: "",
    mobile: "",
    street: "",
    street2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "United States",
    website: "",
    dietary: "",
    notes: "",
  });

  function load() {
    getPerson({ data: personId }).then((d) => {
      setData(d);
      const p = d.person as Record<string, string | null>;
      setName({
        religiousTitle: String(p.religious_title ?? ""),
        academicTitle: String(p.academic_title ?? ""),
        givenName: String(p.given_name ?? ""),
        middleName: String(p.middle_name ?? p.middle_initial ?? ""),
        familyName: String(p.family_name ?? ""),
        suffix: String(p.suffix ?? ""),
      });
      setEdit({
        email: String(p.email ?? ""),
        phone: String(p.phone ?? ""),
        mobile: String(p.mobile ?? ""),
        street: String(p.street ?? ""),
        street2: String(p.street2 ?? ""),
        city: String(p.city ?? ""),
        state: String(p.state ?? ""),
        postalCode: String(p.postal_code ?? ""),
        country: String(p.country ?? "United States"),
        website: String(p.website ?? ""),
        dietary: String(p.dietary ?? ""),
        notes: String(p.notes ?? ""),
      });
    });
    listPartners({ data: undefined }).then((r) => setOrgs(r.map((o) => ({ id: o.id, name: o.name }))));
  }
  useEffect(load, [personId]);
  if (!data) return <p className="text-muted">Loading…</p>;
  const p = data.person as Record<string, string | null>;
  const heading = listedName({
    display_name: p.display_name,
    given_name: p.given_name,
    family_name: p.family_name,
    middle_name: p.middle_name ?? p.middle_initial,
    suffix: p.suffix,
    honorific: p.honorific,
    religious_title: p.religious_title,
    academic_title: p.academic_title,
  });
  const address = [p.street, p.street2, [p.city, p.state, p.postal_code].filter(Boolean).join(" "), p.country]
    .filter(Boolean)
    .join(" · ");
  const phones = [p.phone, p.mobile].filter(Boolean).join(" · ");
  const webHref = p.website
    ? /^https?:\/\//i.test(p.website)
      ? p.website
      : `https://${p.website}`
    : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl">{heading}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {data.roles.map((r) => (
            <Badge key={r} tone="bronze">
              {roleLabel(r)}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-ink-soft">
          {p.email ?? "No email"}
          {phones ? ` · ${phones}` : " · No phone"}
        </p>
        {address ? <p className="text-sm text-ink-soft">{address}</p> : null}
        {webHref ? (
          <p className="text-sm">
            <a href={webHref} className="text-bronze underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
              {p.website}
            </a>
          </p>
        ) : null}
        {p.dietary && <p className="mt-1 text-sm">Dietary: {p.dietary}</p>}
      </header>

      <form
        className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await updatePerson({
              data: {
                id: personId,
                givenName: name.givenName,
                familyName: name.familyName,
                middleName: name.middleName,
                suffix: name.suffix,
                religiousTitle: name.religiousTitle,
                academicTitle: name.academicTitle,
                ...edit,
                roles: data.roles.length ? data.roles : ["friend"],
              },
            });
            toast.success("Saved");
            load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save");
          }
        }}
      >
        <PersonNameFields value={name} onChange={setName} />
        <Field label="Email">
          <Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} autoComplete="email" />
        </Field>
        <Field label="Phone">
          <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} autoComplete="tel" />
        </Field>
        <Field label="Mobile">
          <Input value={edit.mobile} onChange={(e) => setEdit({ ...edit, mobile: e.target.value })} autoComplete="tel" />
        </Field>
        <Field label="Street">
          <Input value={edit.street} onChange={(e) => setEdit({ ...edit, street: e.target.value })} autoComplete="street-address" />
        </Field>
        <Field label="Apt / suite">
          <Input value={edit.street2} onChange={(e) => setEdit({ ...edit, street2: e.target.value })} autoComplete="address-line2" />
        </Field>
        <Field label="City">
          <Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} autoComplete="address-level2" />
        </Field>
        <Field label="State">
          <ListSelect listKey="state" value={edit.state} onChange={(state) => setEdit({ ...edit, state })} />
        </Field>
        <Field label="Postal code">
          <Input value={edit.postalCode} onChange={(e) => setEdit({ ...edit, postalCode: e.target.value })} autoComplete="postal-code" />
        </Field>
        <Field label="Country">
          <ListSelect listKey="country" value={edit.country} onChange={(country) => setEdit({ ...edit, country })} allowEmpty={false} />
        </Field>
        <Field label="Website">
          <Input value={edit.website} onChange={(e) => setEdit({ ...edit, website: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="Dietary">
          <Input value={edit.dietary} onChange={(e) => setEdit({ ...edit, dietary: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <Textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </Field>
        </div>
        <Button type="submit">Save person</Button>
      </form>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-display text-xl">Log a touch</h2>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            await logTouch({ data: { personId, kind, summary } });
            toast.success("Touch logged");
            setSummary("");
            load();
          }}
        >
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="sm:w-40">
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="visit">Visit</option>
            <option value="after_mass">After Mass</option>
            <option value="other">Other</option>
          </Select>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Spoke with Fr. James after the 9am" required />
          <Button type="submit">Log</Button>
        </form>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-display text-xl">Partners</h2>
        <div className="mt-3">
          <PersonPartnersFields
            partners={orgs}
            attached={data.affiliations
              .filter((a) => a.org_id)
              .map((a) => ({
                organizationId: a.org_id as string,
                displayName: a.org_name ?? "Partner",
                roleKey: a.role_key,
                affiliationId: a.id,
              }))}
            onAdd={async (organizationId, roleKey) => {
              try {
                await addAffiliation({ data: { personId, organizationId, roleKey } });
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

      <section>
        <h2 className="mb-2 font-display text-xl">Gatherings</h2>
        {data.celebrated.length > 0 && (
          <p className="mb-2 text-sm text-muted">Celebrant for {data.celebrated.map((e) => e.title).join("; ")}</p>
        )}
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {data.gatherings.map((g) => (
            <li key={g.event_id + g.kind_key}>
              <Link to="/events/$eventId" params={{ eventId: g.event_id }} className="block px-4 py-3 hover:bg-paper-2">
                {g.title} · {g.kind_key} · {g.guest_status ?? ""}
              </Link>
            </li>
          ))}
          {data.gatherings.length === 0 && <li className="px-4 py-3 text-muted">No gatherings yet.</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Touches</h2>
        <ul className="space-y-2">
          {data.touches.map((t) => (
            <li key={t.id} className="text-sm">
              <span className="text-muted">
                {new Date(t.happened_at).toLocaleDateString()} · {t.kind}
              </span>
              <p>{t.summary}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
