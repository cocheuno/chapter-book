import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { addInvite, listInvites, listPeople, listPartners, updateParticipation } from "@/lib/crm/actions";
import { orgTypeLabel } from "@/lib/crm/constants";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/$eventId/invites")({ component: InvitesPage });

function InvitesPage() {
  return (
    <Gated>
      <InvitesInner />
    </Gated>
  );
}

function InvitesInner() {
  const { eventId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof listInvites>> | null>(null);
  const [tab, setTab] = useState<"people" | "partners">("people");
  const [pick, setPick] = useState("");
  const [people, setPeople] = useState<{ id: string; display_name: string }[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string; type_key: string }[]>([]);

  function load() {
    listInvites({ data: eventId }).then(setData);
    listPeople({ data: undefined }).then((r) => setPeople(r.map((p) => ({ id: p.id, display_name: p.display_name }))));
    listPartners({ data: undefined }).then(setOrgs);
  }
  useEffect(load, [eventId]);
  if (!data) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/events/$eventId" params={{ eventId }} className="text-sm text-bronze hover:underline">
          Back to workspace
        </Link>
        <h1 className="font-display text-3xl">Invites</h1>
      </div>
      <div className="flex gap-2">
        {(["people", "partners"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`min-h-11 rounded-full px-3 py-1 text-sm capitalize ${tab === t ? "bg-ink text-paper" : "bg-paper-2"}`}
            onClick={() => {
              setTab(t);
              setPick("");
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!pick) return;
          try {
            if (tab === "people") await addInvite({ data: { eventId, partyType: "person", personId: pick } });
            if (tab === "partners") await addInvite({ data: { eventId, partyType: "organization", organizationId: pick } });
            toast.success("Added");
            setPick("");
            load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not add");
          }
        }}
      >
        <Select value={pick} onChange={(e) => setPick(e.target.value)} required>
          <option value="">Add from list…</option>
          {tab === "people" &&
            people.map((p) => {
              const invited = data.people.some((row) => row.person_id === p.id);
              return (
                <option key={p.id} value={p.id} disabled={invited}>
                  {invited ? `${p.display_name} (already invited)` : p.display_name}
                </option>
              );
            })}
          {tab === "partners" &&
            orgs.map((o) => {
              const invited = data.partners.some((row) => row.organization_id === o.id);
              return (
                <option key={o.id} value={o.id} disabled={invited}>
                  {invited ? `${o.name} (already invited)` : `${o.name} (${orgTypeLabel(o.type_key)})`}
                </option>
              );
            })}
        </Select>
        <Button type="submit">Add</Button>
      </form>
      {tab === "people" && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {data.people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="font-medium">{p.display_name}</p>
                <p className="text-sm text-muted">
                  {p.kind_key}
                  {p.party_size > 1 ? ` · group of ${p.party_size}` : ""}
                  {p.org_name ? ` · ${p.org_name}` : ""}
                </p>
              </div>
              <Input
                className="w-36"
                defaultValue={p.dietary ?? ""}
                key={`${p.id}-${p.dietary ?? ""}`}
                placeholder={p.person_dietary ? `Dietary (${p.person_dietary})` : "Dietary for this event"}
                aria-label={`Dietary for ${p.display_name}`}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v === (p.dietary ?? "")) return;
                  updateParticipation({ data: { id: p.id, dietaryForThisEvent: v } }).then(load);
                }}
              />
              <Select
                value={p.guest_status ?? "no_response"}
                className="w-40"
                onChange={(e) => updateParticipation({ data: { id: p.id, guestStatus: e.target.value } }).then(load)}
              >
                {["no_response", "attending", "declined", "waitlisted", "attended", "no_show"].map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </li>
          ))}
          {data.people.length === 0 && <li className="px-4 py-6 text-muted">No one invited yet.</li>}
        </ul>
      )}
      {tab === "partners" && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {data.partners.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <span>
                {p.name}
                {p.type_key ? <span className="text-sm text-muted"> · {orgTypeLabel(p.type_key)}</span> : null}
              </span>
              <Select
                value={p.publicity_status ?? "asked"}
                className="w-44"
                onChange={(e) => updateParticipation({ data: { id: p.id, publicityStatus: e.target.value } }).then(load)}
              >
                {["asked", "will_announce", "announced", "declined"].map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      )}
      <a href={`/mail/compose?eventId=${eventId}`}>
        <Button variant="secondary">Write a school faculty letter</Button>
      </a>
    </div>
  );
}
