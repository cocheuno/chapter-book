import { ORG_AFFIL_ROLES, roleLabel } from "@/lib/crm/constants";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useMemo, useState } from "react";

export type PersonPartnerOption = {
  id: string;
  name: string;
};

export type PersonPartnerLink = {
  organizationId: string;
  displayName: string;
  roleKey: string;
  affiliationId?: string;
};

export function PersonPartnersFields({
  partners,
  attached,
  onAdd,
  onRemove,
}: {
  partners: PersonPartnerOption[];
  attached: PersonPartnerLink[];
  onAdd: (organizationId: string, roleKey: string) => void | Promise<void>;
  onRemove: (row: PersonPartnerLink) => void | Promise<void>;
}) {
  const [organizationId, setOrganizationId] = useState("");
  const [roleKey, setRoleKey] = useState("other");
  const taken = useMemo(() => new Set(attached.map((a) => a.organizationId)), [attached]);
  const available = partners.filter((p) => !taken.has(p.id));

  return (
    <div className="sm:col-span-2 space-y-3">
      <p className="text-sm font-medium text-ink-soft">Partners</p>
      <p className="text-sm text-ink-soft">Choose from Partners. You can add more or remove them later.</p>
      {attached.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
          {attached.map((row) => (
            <li
              key={row.affiliationId ?? row.organizationId}
              className="flex min-h-11 items-center justify-between gap-3 px-3 py-2"
            >
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
      {attached.length === 0 && <p className="text-sm text-muted">No house on file yet.</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          className="sm:flex-1"
          aria-label="Partner"
        >
          <option value="">{available.length ? "Choose a partner" : "Every partner is already listed"}</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
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
          disabled={!organizationId}
          onClick={async () => {
            if (!organizationId) return;
            await onAdd(organizationId, roleKey);
            setOrganizationId("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
