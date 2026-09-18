import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import {
  addInvite,
  addNamedGuest,
  listInvites,
  listPeople,
  listPartners,
  removeParticipation,
  updateParticipation,
} from "@/lib/crm/actions";
import { orgTypeLabel } from "@/lib/crm/constants";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/$eventId/invites")({ component: InvitesPage });

function AttendanceBoxes({
  mass,
  dinner,
  lecture,
  onChange,
}: {
  mass: boolean;
  dinner: boolean;
  lecture: boolean;
  onChange: (next: { comingToMass: boolean; comingToDinner: boolean; comingToLecture: boolean }) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={mass}
          onChange={(e) => onChange({ comingToMass: e.target.checked, comingToDinner: dinner, comingToLecture: lecture })}
        />
        Mass
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={dinner}
          onChange={(e) => onChange({ comingToMass: mass, comingToDinner: e.target.checked, comingToLecture: lecture })}
        />
        Dinner
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={lecture}
          onChange={(e) => onChange({ comingToMass: mass, comingToDinner: dinner, comingToLecture: e.target.checked })}
        />
        Lecture
      </label>
    </div>
  );
}

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
  const [guestName, setGuestName] = useState("");
  const [mass, setMass] = useState(true);
  const [dinner, setDinner] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [people, setPeople] = useState<{ id: string; display_name: string }[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string; type_key: string }[]>([]);

  function load() {
    listInvites({ data: eventId }).then(setData);
    listPeople({ data: undefined }).then((r) => setPeople(r.map((p) => ({ id: p.id, display_name: p.display_name }))));
    listPartners({ data: undefined }).then(setOrgs);
  }
  useEffect(load, [eventId]);
  if (!data) return <p className="text-muted">Loading…</p>;

  const massN = data.people.filter((p) => p.coming_to_mass && p.guest_status !== "declined").length;
  const dinnerN = data.people.filter((p) => p.coming_to_dinner && p.guest_status !== "declined").length;
  const lectureN = data.people.filter((p) => p.coming_to_lecture && p.guest_status !== "declined").length;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/events/$eventId" params={{ eventId }} className="text-sm text-bronze hover:underline">
          Back to workspace
        </Link>
        <h1 className="font-display text-3xl">Invites</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Mass {massN} · Dinner {dinnerN} · Lecture {lectureN}. The same name may be entered more than once.
        </p>
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
      {tab === "people" && (
        <form
          className="space-y-3 rounded-xl border border-line bg-surface p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = guestName.trim();
            if (!name) return;
            try {
              await addNamedGuest({
                data: {
                  eventId,
                  guestName: name,
                  comingToMass: mass,
                  comingToDinner: dinner,
                  comingToLecture: lecture,
                },
              });
              toast.success("Name added");
              setGuestName("");
              load();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not add");
            }
          }}
        >
          <p className="text-sm font-medium">Add a name</p>
          <p className="text-sm text-ink-soft">
            Use this for people who registered, including extra guests. You may add the same name again.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Name as registered"
              required
            />
            <Button type="submit">Add name</Button>
          </div>
          <AttendanceBoxes
            mass={mass}
            dinner={dinner}
            lecture={lecture}
            onChange={(n) => {
              setMass(n.comingToMass);
              setDinner(n.comingToDinner);
              setLecture(n.comingToLecture);
            }}
          />
        </form>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!pick) return;
          try {
            if (tab === "people") {
              await addInvite({
                data: {
                  eventId,
                  partyType: "person",
                  personId: pick,
                  comingToMass: mass,
                  comingToDinner: dinner,
                  comingToLecture: lecture,
                },
              });
            }
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
          <option value="">{tab === "people" ? "Or add from People…" : "Add from list…"}</option>
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
        <Button type="submit">Add from book</Button>
      </form>
      {tab === "people" && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {data.people.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{p.display_name}</p>
                  <p className="text-sm text-muted">
                    {p.person_id ? "In People" : "Named guest"}
                    {p.org_name ? ` · ${p.org_name}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm text-danger hover:underline"
                  onClick={async () => {
                    await removeParticipation({ data: { id: p.id } });
                    load();
                  }}
                >
                  Remove
                </button>
              </div>
              <AttendanceBoxes
                mass={p.coming_to_mass}
                dinner={p.coming_to_dinner}
                lecture={p.coming_to_lecture}
                onChange={(n) => updateParticipation({ data: { id: p.id, ...n } }).then(load)}
              />
              <div className="flex flex-wrap gap-2">
                <Input
                  className="w-36"
                  defaultValue={p.dietary ?? ""}
                  key={`${p.id}-${p.dietary ?? ""}`}
                  placeholder={p.person_dietary ? `Dietary (${p.person_dietary})` : "Dietary"}
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
              </div>
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
