import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { listInvites, updateParticipation, walkUpCheckIn } from "@/lib/crm/actions";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/$eventId/check-in")({ component: CheckInPage });

function CheckInPage() {
  return (
    <Gated>
      <CheckInInner />
    </Gated>
  );
}

function CheckInInner() {
  const { eventId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof listInvites>> | null>(null);
  const [q, setQ] = useState("");
  const [walk, setWalk] = useState({ name: "", email: "" });
  const [showWalk, setShowWalk] = useState(false);

  function load() {
    listInvites({ data: eventId }).then(setData);
  }
  useEffect(load, [eventId]);
  const people = useMemo(() => {
    const list = data?.people ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((p) => (p.display_name ?? "").toLowerCase().includes(qq));
  }, [data, q]);
  const attended = data?.people.filter((p) => p.guest_status === "attended").reduce((a, p) => a + p.party_size, 0) ?? 0;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link to="/events/$eventId" params={{ eventId }} className="text-sm text-bronze hover:underline">
        Done
      </Link>
      <h1 className="font-display text-3xl">Check in</h1>
      <p className="text-lg tabular-nums text-bronze">{attended} attended</p>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" autoFocus />
      <Button variant="secondary" className="w-full" onClick={() => setShowWalk((v) => !v)}>
        Walk-up
      </Button>
      {showWalk && (
        <form
          className="space-y-2 rounded-xl border border-line bg-surface p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await walkUpCheckIn({ data: { eventId, displayName: walk.name, email: walk.email } });
              toast.success(r.alreadyInvited ? "Checked in — they were already on the list." : "Checked in");
              setWalk({ name: "", email: "" });
              setShowWalk(false);
              load();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not check in");
            }
          }}
        >
          <Input value={walk.name} onChange={(e) => setWalk({ ...walk, name: e.target.value })} placeholder="Name" required />
          <Input value={walk.email} onChange={(e) => setWalk({ ...walk, email: e.target.value })} placeholder="Email (optional)" />
          <Button type="submit" className="w-full">
            Add and mark attended
          </Button>
        </form>
      )}
      <ul className="space-y-2">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <div>
              <p className="font-medium">{p.display_name}</p>
              <p className="text-sm text-muted">
                {p.org_name ?? p.kind_key}
                {p.party_size > 1 ? ` · group of ${p.party_size}` : ""}
              </p>
            </div>
            {p.guest_status === "attended" ? (
              <span className="text-sm font-medium text-ok">Attended</span>
            ) : (
              <Button
                onClick={async () => {
                  await updateParticipation({ data: { id: p.id, guestStatus: "attended" } });
                  load();
                }}
              >
                {p.party_size > 1 ? `Mark ${p.party_size}` : "Attended"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
