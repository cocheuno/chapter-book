import { ORG_AFFIL_ROLES, roleLabel } from "@/lib/crm/constants";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useMemo, useState } from "react";

export type PartnerPersonOption = {
  id: string;
  display_name: string;
  email?: string | null;
};

export type PartnerPersonLink = {
  personId: string;
  displayName: string;
  roleKey: string;
  affiliationId?: string;
};

export function PartnerPeopleFields({
  people,
  attached,
  onAdd,
  onRemove,
}: {
  people: PartnerPersonOption[];
  attached: PartnerPersonLink[];
  onAdd: (personId: string, roleKey: string) => void | Promise<void>;
  onRemove: (row: PartnerPersonLink) => void | Promise<void>;
}) {
  const [personId, setPersonId] = useState("");
  const [roleKey, setRoleKey] = useState("other");
  const taken = useMemo(() => new Set(attached.map((a) => a.personId)), [attached]);
  const available = people.filter((p) => !taken.has(p.id));

  return (
    <div className="sm:col-span-2 space-y-3">
      <p className="text-sm text-ink-soft">Choose from People. You can add more or remove them later.</p>
      {attached.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
          {attached.map((row) => (
            <li key={row.affiliationId ?? row.personId} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
              <span>
                {row.displayName}
                <span className="ml-2 text-sm text-muted">· {roleLabel(row.roleKey)}</span>
              </span>
              <button type="button" className="text-sm text-danger hover:underline" onClick={() => void onRemove(row)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {attached.length === 0 && <p className="text-sm text-muted">No one on file yet.</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={personId} onChange={(e) => setPersonId(e.target.value)} className="sm:flex-1" aria-label="Person">
          <option value="">{available.length ? "Choose a person" : "Everyone in People is already listed"}</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
              {p.email ? ` · ${p.email}` : ""}
            </option>
          ))}
        </Select>
        <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} aria-label="Office">
          {ORG_AFFIL_ROLES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          disabled={!personId}
          onClick={async () => {
            if (!personId) return;
            await onAdd(personId, roleKey);
            setPersonId("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
