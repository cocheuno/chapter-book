import { createFileRoute, Link } from "@tanstack/react-router";
import { DuplicateHint } from "@/components/duplicate-hint";
import { Gated } from "@/components/gate";
import { ListSelect } from "@/components/list-select";
import { PersonNameFields, type PersonNameValue } from "@/components/person-name-fields";
import { PersonPartnersFields, type PersonPartnerLink } from "@/components/person-partners-fields";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PERSON_ROLES, roleLabel } from "@/lib/crm/constants";
import { createPerson, listPartners, listPeople } from "@/lib/crm/actions";
import { getSessionContext } from "@/lib/crm/member";
import { addPersonTag, listTags, tagPeople } from "@/lib/crm/tags";
import { matchPerson } from "@/lib/crm/match";
import { composePersonName, isDegreeTitle } from "@/lib/crm/names";
import { deceasedMark } from "@/lib/crm/person-status";
import { rememberList } from "@/lib/nav/nav-store";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/people/")({
  validateSearch: (search: Record<string, unknown>): { role?: string; degree?: "1"; tag?: string } => ({
    role: typeof search.role === "string" && search.role.length > 0 ? search.role : undefined,
    degree: search.degree === "1" || search.degree === 1 ? "1" : undefined,
    tag: typeof search.tag === "string" && search.tag.length > 0 ? search.tag : undefined,
  }),
  component: PeoplePage,
});

const emptyName: PersonNameValue = {
  religiousTitle: "",
  academicTitle: "",
  givenName: "",
  middleName: "",
  familyName: "",
  suffix: "",
  postNominals: "",
  salutationOverride: "",
};

function PeoplePage() {
  return (
    <Gated>
      <PeopleInner />
    </Gated>
  );
}

function PeopleInner() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const role = search.role;
  const tag = search.tag;
  const degreeOn = search.degree === "1";
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPeople>>>([]);
  const [tagOptions, setTagOptions] = useState<{ id: string; name: string }[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [bulkName, setBulkName] = useState("");
  const [allPeople, setAllPeople] = useState<Awaited<ReturnType<typeof listPeople>>>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<PersonNameValue>(emptyName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mobile, setMobile] = useState("");
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("Wisconsin");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("United States");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [newRole, setNewRole] = useState("academic_member");
  const [partners, setPartners] = useState<Awaited<ReturnType<typeof listPartners>>>([]);
  const [attached, setAttached] = useState<PersonPartnerLink[]>([]);

  function load() {
    listPeople({ data: { role, tagId: tag } }).then(setRows).catch(() => setRows([]));
    listPeople({ data: undefined }).then(setAllPeople).catch(() => setAllPeople([]));
    listPartners({ data: undefined }).then(setPartners).catch(() => setPartners([]));
    listTags().then(setTagOptions).catch(() => setTagOptions([]));
  }
  useEffect(load, [role, tag]);
  useEffect(() => {
    getSessionContext()
      .then((session) => setCanEdit(session.role === "admin" || session.role === "editor"))
      .catch(() => setCanEdit(false));
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (tag) params.set("tag", tag);
    if (degreeOn) params.set("degree", "1");
    const query = params.toString();
    rememberList("people", query ? `/people?${query}` : "/people");
  }, [role, tag, degreeOn]);

  const listed = composePersonName({ ...name, postNominals: "" });
  const visible = degreeOn ? rows.filter((row) => isDegreeTitle(row.academic_title)) : rows;
  const hit = useMemo(
    () => matchPerson(allPeople, listed || `${name.givenName} ${name.familyName}`, email),
    [allPeople, listed, name.givenName, name.familyName, email],
  );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (hit.hard) {
      toast.error(
        hit.hard.reason === "email"
          ? `${hit.hard.name} is already in the book with that email.`
          : `${hit.hard.name} is already in the book.`,
      );
      return;
    }
    try {
      const r = await createPerson({
        data: {
          givenName: name.givenName,
          familyName: name.familyName,
          middleName: name.middleName,
          suffix: name.suffix,
          email,
          phone,
          mobile,
          street,
          street2,
          city,
          state,
          postalCode,
          country,
          website,
          notes,
          roles: [newRole],
          religiousTitle: name.religiousTitle,
          academicTitle: name.academicTitle,
          postNominals: name.postNominals,
          salutationOverride: name.salutationOverride,
          partners: attached.map((a) => ({ organizationId: a.organizationId, roleKey: a.roleKey })),
        },
      });
      if (r.duplicate) {
        toast.error(
          r.reason === "email"
            ? `${r.name} is already in the book with that email.`
            : `${r.name} is already in the book.`,
        );
        return;
      }
      toast.success("Person added");
      window.location.href = `/people/${r.id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">People</h1>
          <p className="text-ink-soft">Scientists, teachers, clergy, students, friends.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canEdit ? (
            <Link
              to="/people/import"
              className="text-sm font-medium text-bronze underline-offset-2 hover:underline"
            >
              Import
            </Link>
          ) : null}
          <Link to="/people/lists" className="text-sm font-medium text-bronze underline-offset-2 hover:underline">
            Saved lists
          </Link>
          <Button onClick={() => setOpen((v) => !v)}>Add person</Button>
        </div>
      </div>
      {open && (
        <form onSubmit={add} className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
          <PersonNameFields value={name} onChange={setName} />
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </Field>
          <Field label="Mobile">
            <Input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel" />
          </Field>
          <Field label="Street">
            <Input value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" />
          </Field>
          <Field label="Apt / suite">
            <Input value={street2} onChange={(e) => setStreet2(e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="State">
            <ListSelect listKey="state" value={state} onChange={setState} />
          </Field>
          <Field label="Postal code">
            <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} autoComplete="postal-code" />
          </Field>
          <Field label="Country">
            <ListSelect listKey="country" value={country} onChange={setCountry} allowEmpty={false} />
          </Field>
          <Field label="Website">
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} />
          </Field>
          <Field label="Role">
            <Select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {PERSON_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <p className="mb-1 text-sm text-ink-soft">For future knowledge. No length limit.</p>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-40" />
            </Field>
          </div>
          <PersonPartnersFields
            partners={partners}
            attached={attached}
            onAdd={(organizationId, roleKey) => {
              const p = partners.find((x) => x.id === organizationId);
              if (!p) return;
              setAttached((cur) => [...cur, { organizationId, displayName: p.name, roleKey }]);
            }}
            onRemove={(row) => setAttached((cur) => cur.filter((a) => a.organizationId !== row.organizationId))}
          />
          {hit.hard && (
            <div className="sm:col-span-2">
              <DuplicateHint href={`/people/${hit.hard.id}`}>
                {hit.hard.reason === "email"
                  ? `${hit.hard.name} is already in the book with that email.`
                  : `${hit.hard.name} is already in the book. Add an email if this is someone else.`}
              </DuplicateHint>
            </div>
          )}
          {hit.soft && (
            <div className="sm:col-span-2">
              <DuplicateHint href={`/people/${hit.soft.id}`}>
                There is already a {hit.soft.name}
                {hit.soft.email ? ` (${hit.soft.email})` : ""}. If this is the same person, open them instead.
              </DuplicateHint>
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={Boolean(hit.hard)}>
              Save
            </Button>
          </div>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`min-h-11 rounded-full px-3 py-1 text-sm ${!role ? "bg-ink text-paper" : "bg-paper-2"}`}
          onClick={() =>
            void navigate({
              search: { role: undefined, degree: degreeOn ? "1" : undefined, tag },
              replace: true,
            })
          }
        >
          All
        </button>
        {PERSON_ROLES.slice(0, 6).map((r) => (
          <button
            key={r.key}
            type="button"
            className={`min-h-11 rounded-full px-3 py-1 text-sm ${role === r.key ? "bg-ink text-paper" : "bg-paper-2"}`}
            onClick={() =>
              void navigate({
                search: { role: r.key, degree: degreeOn ? "1" : undefined, tag },
                replace: true,
              })
            }
          >
            {r.label}
          </button>
        ))}
        <button
          type="button"
          className={`min-h-11 rounded-full px-3 py-1 text-sm ${degreeOn ? "bg-ink text-paper" : "bg-paper-2"}`}
          onClick={() =>
            void navigate({
              search: { role, degree: degreeOn ? undefined : "1", tag },
              replace: true,
            })
          }
        >
          Degree in the title field
        </button>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <span className="text-ink-soft">Tag</span>
          <Select
            className="w-auto min-w-40"
            value={tag ?? ""}
            onChange={(e) =>
              void navigate({
                search: { role, degree: degreeOn ? "1" : undefined, tag: e.target.value || undefined },
                replace: true,
              })
            }
          >
            <option value="">Any</option>
            {tagOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {(role || degreeOn || tag) && canEdit && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const name = bulkName.trim();
            if (!name || visible.length < 1) return;
            if (visible.length > 2000) {
              toast.error("Tag up to 2000 people at a time.");
              return;
            }
            const ids = visible.map((person) => person.id);
            const existing = tagOptions.find((item) => item.name.toLowerCase() === name.toLowerCase());
            const run = existing
              ? tagPeople({ data: { tagId: existing.id, personIds: ids } })
              : addPersonTag({ data: { personId: ids[0], name } }).then((created) =>
                  tagPeople({ data: { tagId: created.id, personIds: ids } }),
                );
            void run
              .then(() => {
                toast.success(`Tagged ${ids.length} people.`);
                setBulkName("");
                load();
              })
              .catch((err) => toast.error(err instanceof Error ? err.message : "Could not tag"));
          }}
        >
          <Field label={`Tag these ${visible.length} people…`}>
            <Input value={bulkName} onChange={(e) => setBulkName(e.target.value)} list="people-tag-names" />
          </Field>
          <datalist id="people-tag-names">
            {tagOptions.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
          <Button type="submit" variant="secondary" disabled={visible.length < 1}>
            Tag
          </Button>
        </form>
      )}
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {visible.map((p) => (
          <li key={p.id}>
            <Link to="/people/$personId" params={{ personId: p.id }} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-paper-2">
              <div>
                <p className="font-medium">
                  {p.display_name}
                  {deceasedMark(p.status)}
                </p>
                <p className="text-sm text-muted">
                  {p.roles.map(roleLabel).join(", ")}
                  {p.primary ? ` · ${roleLabel(p.primary.role_key)} at ${p.primary.org_name}` : ""}
                </p>
              </div>
              <span className="text-sm text-muted">{p.city}</span>
            </Link>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-4 py-8 text-muted">
            {role || tag
              ? "No one matches this filter."
              : degreeOn
                ? "No one has a degree in the title field."
                : "Add the pastor of your first host parish."}
          </li>
        )}
      </ul>
    </div>
  );
}
