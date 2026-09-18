import { createFileRoute, Link } from "@tanstack/react-router";
import { DuplicateHint } from "@/components/duplicate-hint";
import { Gated } from "@/components/gate";
import { ListSelect } from "@/components/list-select";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ORG_TYPES, orgTypeLabel } from "@/lib/crm/constants";
import { createOrganization, listDioceses, listPartners } from "@/lib/crm/actions";
import { matchPartner } from "@/lib/crm/match";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/partners/")({ component: PartnersPage });

function PartnersPage() {
  return (
    <Gated>
      <PartnersInner />
    </Gated>
  );
}

function PartnersInner() {
  const [tab, setTab] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPartners>>>([]);
  const [allPartners, setAllPartners] = useState<Awaited<ReturnType<typeof listPartners>>>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [typeKey, setTypeKey] = useState("parish");
  const [city, setCity] = useState("");
  const [state, setState] = useState("New Mexico");
  const [country, setCountry] = useState("United States");
  const [parentId, setParentId] = useState("");
  const [dioceses, setDioceses] = useState<{ id: string; name: string }[]>([]);

  function load() {
    listPartners({ data: tab }).then(setRows);
    listPartners({ data: undefined }).then(setAllPartners);
    listDioceses().then(setDioceses);
  }
  useEffect(load, [tab]);

  const hit = useMemo(() => matchPartner(allPartners, name, city), [allPartners, name, city]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Partners</h1>
          <p className="text-ink-soft">Parishes, high schools, universities, dioceses, and others.</p>
        </div>
        <Button onClick={() => setOpen((v) => !v)}>Add partner</Button>
      </div>
      {open && (
        <form
          className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (hit.hard) {
              toast.error(
                hit.hard.city
                  ? `${hit.hard.name} is already a partner in ${hit.hard.city}.`
                  : `${hit.hard.name} is already a partner.`,
              );
              return;
            }
            try {
              const r = await createOrganization({
                data: { name, typeKey, city, state, country, parentId: parentId || undefined },
              });
              toast.success("Partner added");
              window.location.href = `/partners/${r.id}`;
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not add");
            }
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Type">
            <Select value={typeKey} onChange={(e) => setTypeKey(e.target.value)}>
              {ORG_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="State">
            <ListSelect listKey="state" value={state} onChange={setState} />
          </Field>
          <Field label="Country">
            <ListSelect listKey="country" value={country} onChange={setCountry} allowEmpty={false} />
          </Field>
          <Field label="Diocese">
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">None</option>
              {dioceses.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          {hit.hard && (
            <div className="sm:col-span-2">
              <DuplicateHint href={`/partners/${hit.hard.id}`}>
                {hit.hard.city
                  ? `${hit.hard.name} is already a partner in ${hit.hard.city}.`
                  : `${hit.hard.name} is already a partner.`}
              </DuplicateHint>
            </div>
          )}
          {!hit.hard && hit.soft && (
            <div className="sm:col-span-2">
              <DuplicateHint href={`/partners/${hit.soft.id}`}>
                {hit.soft.name} is already a partner
                {hit.soft.city ? ` in ${hit.soft.city}` : ""}. Add a different city if this is another house of the same name.
              </DuplicateHint>
            </div>
          )}
          <Button type="submit" disabled={Boolean(hit.hard)}>
            Save
          </Button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {[undefined, "parish", "high_school", "university", "diocese", "other"].map((k) => (
          <button
            key={k ?? "all"}
            type="button"
            className={`min-h-11 rounded-full px-3 py-1 text-sm ${tab === k ? "bg-ink text-paper" : "bg-paper-2"}`}
            onClick={() => setTab(k)}
          >
            {k ? orgTypeLabel(k) : "All"}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.map((o) => (
          <li key={o.id}>
            <Link
              to="/partners/$orgId"
              params={{ orgId: o.id }}
              className="flex min-h-14 items-center justify-between px-4 py-3 hover:bg-paper-2"
            >
              <div>
                <p className="font-medium">{o.name}</p>
                <p className="text-sm text-muted">{orgTypeLabel(o.type_key)}</p>
              </div>
              <span className="text-sm text-muted">{[o.city, o.state].filter(Boolean).join(", ")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
