import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumbs } from "@/components/crumbs";
import { Gated } from "@/components/gate";
import { PersonNameFields, type PersonNameValue } from "@/components/person-name-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ListSelect } from "@/components/list-select";
import { PersonPartnersFields } from "@/components/person-partners-fields";
import { roleLabel } from "@/lib/crm/constants";
import { addAffiliation, getPerson, listPartners, logTouch, removeAffiliation, searchAll, setPersonStatus, updatePerson } from "@/lib/crm/actions";
import { getSessionContext } from "@/lib/crm/member";
import { MERGE_FIELDS } from "@/lib/crm/person-merge";
import { addPersonEmail, listPersonEmails, makeMainEmail, removePersonEmail } from "@/lib/crm/person-emails";
import { getMergePreview, mergePeople } from "@/lib/crm/person-merge-server";
import { attendanceLine } from "@/lib/crm/engagement";
import { listedName } from "@/lib/crm/names";
import { rememberVisit, useListHref } from "@/lib/nav/nav-store";
import { PERSON_STATUSES, deceasedMark } from "@/lib/crm/person-status";
import { useEffect, useRef, useState } from "react";
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
  const peopleHref = useListHref("people", "/people");
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
    postNominals: "",
    salutationOverride: "",
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
  const [status, setStatus] = useState("active");
  const [deceasedOn, setDeceasedOn] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer" | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const navigate = Route.useNavigate();
  const latestId = useRef(personId);
  if (latestId.current !== personId) {
    latestId.current = personId;
    setData(null);
    setMergeOpen(false);
  }

  function load() {
    const id = personId;
    setData(null);
    getPerson({ data: id }).then((d) => {
      if (latestId.current !== id) return;
      setData(d);
      const p = d.person as Record<string, string | null>;
      setName({
        religiousTitle: String(p.religious_title ?? ""),
        academicTitle: String(p.academic_title ?? ""),
        givenName: String(p.given_name ?? ""),
        middleName: String(p.middle_name ?? p.middle_initial ?? ""),
        familyName: String(p.family_name ?? ""),
        suffix: String(p.suffix ?? ""),
        postNominals: String(p.post_nominals ?? ""),
        salutationOverride: String(p.salutation_override ?? ""),
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
      setStatus(String(p.status ?? "active"));
      setDeceasedOn(String(p.deceased_on ?? ""));
    });
    listPartners({ data: undefined }).then((r) => setOrgs(r.map((o) => ({ id: o.id, name: o.name }))));
  }
  useEffect(load, [personId]);
  useEffect(() => {
    getSessionContext()
      .then((session) => setRole(session.role))
      .catch(() => setRole(null));
  }, []);
  useEffect(() => {
    if (!data) return;
    const person = data.person as Record<string, string | null>;
    if (person.id !== personId) return;
    const label = listedName({
      display_name: person.display_name,
      given_name: person.given_name,
      family_name: person.family_name,
      middle_name: person.middle_name ?? person.middle_initial,
      suffix: person.suffix,
      honorific: person.honorific,
      religious_title: person.religious_title,
      academic_title: person.academic_title,
      post_nominals: person.post_nominals,
    });
    if (!label) return;
    rememberVisit({ kind: "person", id: personId, label, href: `/people/${personId}` });
  }, [data, personId]);

  async function saveStatus(nextStatus: string, nextDeceasedOn: string) {
    try {
      await setPersonStatus({
        data: { id: personId, status: nextStatus, deceasedOn: nextStatus === "deceased" ? nextDeceasedOn : "" },
      });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
    load();
  }

  const canMerge = role === "admin" || role === "editor";

  function onMerged(keepId: string, keptName: string) {
    toast.success(`Merged into ${keptName}`);
    setMergeOpen(false);
    if (keepId === personId) {
      load();
      return;
    }
    void navigate({ to: "/people/$personId", params: { personId: keepId }, replace: true });
  }

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
    post_nominals: p.post_nominals,
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
        <Crumbs trail={[{ label: "People", to: peopleHref }, { label: heading }]} />
        <h1 className="font-display text-3xl">
          {heading}
          {deceasedMark(p.status)}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {attendanceLine(data.attendance.count, data.attendance.lastDate)}
        </p>
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

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => {
              const next = e.target.value;
              setStatus(next);
              void saveStatus(next, next === "deceased" ? deceasedOn : "");
            }}
          >
            {PERSON_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        {status === "deceased" && (
          <Field label="Died on">
            <Input
              type="date"
              value={deceasedOn}
              onChange={(e) => {
                const next = e.target.value;
                setDeceasedOn(next);
                void saveStatus("deceased", next);
              }}
            />
          </Field>
        )}
        {canMerge && (
          <Button type="button" variant="secondary" onClick={() => setMergeOpen(true)}>
            Merge with…
          </Button>
        )}
      </div>

      {mergeOpen && canMerge && (
        <MergePanel personId={personId} heading={heading} onCancel={() => setMergeOpen(false)} onMerged={onMerged} />
      )}

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
                postNominals: name.postNominals,
                salutationOverride: name.salutationOverride,
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
        <div className="sm:col-span-2">
          <OtherEmails personId={personId} canEdit={canMerge} onMadeMain={load} />
        </div>
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
            <p className="mb-1 text-sm text-ink-soft">For future knowledge. No length limit.</p>
            <Textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className="min-h-40" />
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

      {data.pastAffiliations.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-xl">Past offices</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.pastAffiliations.map((a, index) => {
              const org = a.org_name || "Partner";
              const dated = Boolean(a.started_on || a.ended_on);
              const startYear = a.started_on ? a.started_on.slice(0, 4) : "?";
              const endYear = a.ended_on ? a.ended_on.slice(0, 4) : "?";
              const line = dated
                ? `${roleLabel(a.role_key)} at ${org} · ${startYear}–${endYear}`
                : `${roleLabel(a.role_key)} at ${org} · ended`;
              return (
                <li key={`${a.role_key}-${org}-${a.ended_on ?? ""}-${index}`} className="px-4 py-3">
                  {line}
                </li>
              );
            })}
          </ul>
        </section>
      )}

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

function OtherEmails({
  personId,
  canEdit,
  onMadeMain,
}: {
  personId: string;
  canEdit: boolean;
  onMadeMain: () => void;
}) {
  const [rows, setRows] = useState<{ id: string; email: string; label: string | null }[]>([]);
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  function reload() {
    listPersonEmails({ data: personId })
      .then((list) => setRows(list))
      .catch(() => setRows([]));
  }

  useEffect(() => {
    let current = true;
    listPersonEmails({ data: personId })
      .then((list) => {
        if (current) setRows(list);
      })
      .catch(() => {
        if (current) setRows([]);
      });
    return () => {
      current = false;
    };
  }, [personId]);

  async function add() {
    const next = email.trim();
    if (!next || busy) return;
    setBusy(true);
    try {
      await addPersonEmail({ data: { personId, email: next, label: label.trim() || undefined } });
      toast.success("Email added");
      setEmail("");
      setLabel("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add that email");
    } finally {
      setBusy(false);
    }
  }

  async function makeMain(emailId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await makeMainEmail({ data: { personId, emailId } });
      toast.success("Main email updated");
      onMadeMain();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the main email");
      setBusy(false);
    }
  }

  async function remove(row: { id: string; email: string }) {
    if (busy) return;
    if (!window.confirm(`Remove ${row.email}?`)) return;
    setBusy(true);
    try {
      await removePersonEmail({ data: { personId, emailId: row.id } });
      toast.success("Email removed");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink-soft">Other emails</p>
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span>{row.email}</span>
              {row.label ? <span className="text-muted">{row.label}</span> : null}
              {canEdit && (
                <>
                  <button type="button" className="text-sm text-bronze hover:underline" onClick={() => void makeMain(row.id)}>
                    Make main
                  </button>
                  <button type="button" className="text-sm text-danger hover:underline" onClick={() => void remove(row)}>
                    Remove
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-soft">Add another email</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            aria-label="Add another email"
            autoComplete="off"
            className="w-full sm:w-64"
          />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="Label (optional)"
            aria-label="Label (optional)"
            className="w-full sm:w-40"
          />
          <button type="button" className="text-sm text-bronze hover:underline" disabled={busy} onClick={() => void add()}>
            Add
          </button>
        </div>
      )}
      <p className="text-sm text-muted">Letters go to the main email only.</p>
    </div>
  );
}

const MOVE_LINES: {
  key: keyof Awaited<ReturnType<typeof getMergePreview>>["counts"];
  label: string;
}[] = [
  { key: "participations", label: "Participations" },
  { key: "affiliations", label: "Affiliations" },
  { key: "roles", label: "Roles" },
  { key: "tasks", label: "Tasks" },
  { key: "touches", label: "Contact notes" },
  { key: "letters", label: "Letters" },
  { key: "registrations", label: "Registrations" },
  { key: "attendees", label: "Attendees" },
  { key: "celebrant", label: "Events as celebrant" },
  { key: "speakerSlots", label: "Speaker slots" },
  { key: "otherEmails", label: "Other emails" },
];

const FIELD_LABEL = new Map(MERGE_FIELDS.map((field) => [field.field, field.label]));

function MergePanel({
  personId,
  heading,
  onCancel,
  onMerged,
}: {
  personId: string;
  heading: string;
  onCancel: () => void;
  onMerged: (keepId: string, keptName: string) => void;
}) {
  type Preview = Awaited<ReturnType<typeof getMergePreview>>;
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ id: string; label: string; hint: string }[]>([]);
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);
  const [side, setSide] = useState<"this" | "other">("this");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picks, setPicks] = useState<Preview["defaultPicks"] | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const sending = useRef(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      searchAll({ data: query })
        .then((rows) => {
          setHits(
            rows
              .filter((row) => row.kind === "person" && row.id !== personId)
              .map((row) => ({ id: row.id, label: row.label, hint: row.hint })),
          );
        })
        .catch(() => setHits([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [query, personId]);

  async function loadPreview(keepId: string, mergeId: string) {
    const ticket = ++request.current;
    setLoading(true);
    setPreview(null);
    try {
      const next = await getMergePreview({ data: { keepId, mergeId } });
      if (request.current !== ticket) return;
      setPreview(next);
      setPicks(next.defaultPicks);
    } catch (err) {
      if (request.current !== ticket) return;
      toast.error(err instanceof Error ? err.message : "Could not load the merge");
    } finally {
      if (request.current === ticket) setLoading(false);
    }
  }

  function choose(hit: { id: string; label: string }) {
    setChosen(hit);
    setQuery("");
    setHits([]);
    setSide("this");
    setConfirmText("");
    void loadPreview(personId, hit.id);
  }

  function chooseSide(next: "this" | "other") {
    if (!chosen || next === side) return;
    setSide(next);
    setConfirmText("");
    const keepId = next === "this" ? personId : chosen.id;
    const mergeId = next === "this" ? chosen.id : personId;
    void loadPreview(keepId, mergeId);
  }

  async function submit() {
    if (!preview || !picks || confirmText.trim() !== "MERGE" || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const result = await mergePeople({
        data: {
          keepId: preview.keep.id,
          mergeId: preview.other.id,
          picks,
          confirm: "MERGE",
        },
      });
      onMerged(result.id, preview.keep.display_name || "the kept record");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not merge");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const otherName =
    preview == null
      ? (chosen?.label ?? "")
      : side === "this"
        ? preview.other.display_name || chosen?.label || ""
        : preview.keep.display_name || chosen?.label || "";
  const sameCount = preview ? MERGE_FIELDS.length - preview.differingFields.length : 0;
  const moveLines = preview ? MOVE_LINES.filter((line) => preview.counts[line.key] > 0) : [];

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <Field label="Find the other record">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or email"
          autoComplete="off"
          autoFocus
        />
      </Field>
      {hits.length > 0 && (
        <ul className="overflow-hidden rounded-lg border border-line">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="block w-full px-3 py-2.5 text-left text-sm hover:bg-paper-2"
                onClick={() => choose(hit)}
              >
                <span className="font-medium">{hit.label}</span>
                <span className="ml-2 text-muted">{hit.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-soft">Keep which record?</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="merge-keep"
              checked={side === "this"}
              onChange={() => chooseSide("this")}
            />
            This record — {heading}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="merge-keep"
              checked={side === "other"}
              onChange={() => chooseSide("other")}
            />
            The other record — {otherName}
          </label>
        </fieldset>
      )}

      {loading && <p className="text-sm text-muted">Loading…</p>}

      {preview && picks && (
        <>
          {preview.differingFields.length > 0 && (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-3 font-medium">Field</th>
                  <th className="py-2 pr-3 font-medium">{preview.keep.display_name || "Kept record"}</th>
                  <th className="py-2 font-medium">{preview.other.display_name || "Other record"}</th>
                </tr>
              </thead>
              <tbody>
                {preview.differingFields.map((field) => (
                  <tr key={field} className="border-b border-line">
                    <td className="py-2 pr-3">{FIELD_LABEL.get(field) ?? field}</td>
                    <td className="py-2 pr-3">
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name={`merge-field-${field}`}
                          checked={picks[field] === "keep"}
                          onChange={() => setPicks({ ...picks, [field]: "keep" })}
                        />
                        <span className="break-words">{preview.keep[field] || "—"}</span>
                      </label>
                    </td>
                    <td className="py-2">
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name={`merge-field-${field}`}
                          checked={picks[field] === "other"}
                          onChange={() => setPicks({ ...picks, [field]: "other" })}
                        />
                        <span className="break-words">{preview.other[field] || "—"}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-sm text-ink-soft">{sameCount} other fields are the same.</p>
          <p className="text-sm text-ink-soft">
            Notes from both records are kept. The email you don't choose is kept as an other email.
          </p>
          <div>
            <h2 className="mb-1 text-sm font-medium">What moves to the kept record</h2>
            {moveLines.length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing else moves.</p>
            ) : (
              <ul className="text-sm">
                {moveLines.map((line) => (
                  <li key={line.key}>
                    {line.label}: {preview.counts[line.key]}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Field label="Type MERGE to confirm">
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="danger"
              disabled={busy || confirmText.trim() !== "MERGE"}
              onClick={() => void submit()}
            >
              Merge records
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {!(preview && picks) && (
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </section>
  );
}
