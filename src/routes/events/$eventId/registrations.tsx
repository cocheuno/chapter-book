import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumbs } from "@/components/crumbs";
import { Gated } from "@/components/gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  cancelAttendee,
  cancelRegistration,
  exportBadges,
  exportCatererCounts,
  exportRegistrationAttendees,
  getConfirmationEmail,
  getRegistrationDesk,
  renameAttendee,
} from "@/lib/crm/registration-desk";
import { formatWhen } from "@/lib/crm/format";
import {
  deskFilter,
  deskSearch,
  isActiveRegistration,
  uniqueEmails,
  type DeskFilter,
} from "@/lib/payments/registration-desk";
import { rememberVisit, useListHref } from "@/lib/nav/nav-store";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/$eventId/registrations")({ component: RegistrationsPage });

type Desk = Awaited<ReturnType<typeof getRegistrationDesk>>;
type Registration = Desk["registrations"][number];
type Attendee = Registration["attendees"][number];

const FILTERS: { id: DeskFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "cancelled", label: "Cancelled" },
  { id: "needs_look", label: "Needs a look" },
];

function downloadCsv(file: { csv: string; filename: string }) {
  const blob = new Blob([file.csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = file.filename;
  link.click();
  const href = link.href;
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function statusTone(status: string): "ok" | "warn" | "muted" {
  if (isActiveRegistration(status)) return "ok";
  if (status === "cancelled" || status === "expired" || status === "refunded") return "warn";
  return "muted";
}

function RegistrationsPage() {
  return (
    <Gated>
      <RegistrationsInner />
    </Gated>
  );
}

function RegistrationsInner() {
  const { eventId } = Route.useParams();
  const eventsHref = useListHref("events", "/events");
  const [data, setData] = useState<Desk | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<DeskFilter>("active");
  const [search, setSearch] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");

  const load = useCallback(() => {
    return getRegistrationDesk({ data: eventId }).then(setData);
  }, [eventId]);

  useEffect(() => {
    let gone = false;
    setFailed(false);
    load().catch((err) => {
      if (gone) return;
      setFailed(true);
      toast.error(err instanceof Error ? err.message : "Could not load");
    });
    return () => {
      gone = true;
    };
  }, [load]);

  useEffect(() => {
    const label = data?.event.title?.trim();
    if (!label) return;
    rememberVisit({ kind: "event", id: eventId, label, href: `/events/${eventId}` });
  }, [data, eventId]);

  async function run(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
      return;
    }
    toast.success(success);
    try {
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load");
    } finally {
      setBusy(false);
      setRenameId(null);
    }
  }

  if (!data) return <p className="text-muted">{failed ? "Could not load registrations." : "Loading…"}</p>;

  const canEdit = data.role !== "viewer";
  const visible = data.registrations.filter(
    (registration) => deskFilter(registration, filter) && deskSearch(registration, search),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <Crumbs
          trail={[
            { label: "Events", to: eventsHref },
            { label: data.event.title, to: `/events/${eventId}` },
            { label: "Registrations" },
          ]}
        />
        <div className="flex flex-wrap gap-4">
          <Link to="/events/$eventId/registration" params={{ eventId }} className="text-sm text-bronze hover:underline">
            Registration setup
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl">{data.event.title}</h1>
          <Badge tone={data.event.switchOn ? "ok" : "muted"}>
            {data.event.switchOn ? "Registration is on" : "Registration is off"}
          </Badge>
        </div>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Count label="Active registrations" value={data.totals.activeRegistrations} />
        <Count label="Active attendees" value={data.totals.activeAttendees} />
        <Count label="Since yesterday" value={data.totals.sinceYesterday} />
      </dl>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Parts</h2>
        <CountTable
          headers={["Part", "Capacity", "Taken", "Held", "Left"]}
          rows={data.parts.map((part) => [
            part.title,
            part.capacity == null ? "No limit" : part.capacity,
            part.taken,
            part.held,
            part.left == null ? "No limit" : part.left,
          ])}
          empty="No parts yet."
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Tickets</h2>
        <CountTable
          headers={["Ticket", "Kind", "Active attendees"]}
          rows={data.tickets.map((ticket) => [ticket.name, ticket.kind.replaceAll("_", " "), ticket.count])}
          empty="No tickets yet."
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Meals</h2>
        <CountTable
          headers={["Meal", "Dietary", "Count"]}
          rows={data.meals.map((meal) => [meal.partTitle, meal.dietary, meal.count])}
          empty="No meals yet."
        />
      </section>

      {data.drift.length > 0 ? (
        <div className="space-y-2">
          {data.drift.map((part) => (
            <p key={part.id} className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
              {part.title} shows {part.taken} taken; active attendees add up to {part.counted}.
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={filter === item.id ? "primary" : "secondary"}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, name, or email" />

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              const emails = uniqueEmails(
                data.registrations.filter((registration) => isActiveRegistration(registration.status)).map((registration) => registration.purchaserEmail),
              );
              void run(async () => {
                await navigator.clipboard.writeText(emails.join(", "));
              }, `Copied ${emails.length}`);
            }}
          >
            Copy emails
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                downloadCsv(await exportRegistrationAttendees({ data: eventId }));
              }, "Exported");
            }}
          >
            Export attendees
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                downloadCsv(await exportCatererCounts({ data: eventId }));
              }, "Exported");
            }}
          >
            Export caterer counts
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                downloadCsv(await exportBadges({ data: eventId }));
              }, "Exported");
            }}
          >
            Export badges
          </Button>
        </div>
      ) : null}

      {visible.length === 0 ? <p className="text-muted">No registrations match.</p> : null}
      <div className="space-y-4">
        {visible.map((registration) => (
          <RegistrationCard
            key={registration.id}
            registration={registration}
            canEdit={canEdit}
            busy={busy}
            renameId={renameId}
            givenName={givenName}
            familyName={familyName}
            onGivenName={setGivenName}
            onFamilyName={setFamilyName}
            onStartRename={(attendee) => {
              setRenameId(attendee.id);
              setGivenName(attendee.givenName);
              setFamilyName(attendee.familyName);
            }}
            onStopRename={() => setRenameId(null)}
            onSaveRename={(attendeeId) => {
              void run(
                () => renameAttendee({ data: { eventId, attendeeId, givenName, familyName } }),
                "Name saved",
              );
            }}
            onCancelAttendee={(attendee) => {
              const name = `${attendee.givenName} ${attendee.familyName}`.trim();
              if (!window.confirm(`Cancel ${name}?`)) return;
              void run(() => cancelAttendee({ data: { eventId, attendeeId: attendee.id } }), "Attendee cancelled");
            }}
            onCancelRegistration={() => {
              if (
                !window.confirm(
                  `Cancel registration ${registration.code}? It has ${registration.attendees.length} attendees.`,
                )
              ) {
                return;
              }
              void run(
                () => cancelRegistration({ data: { eventId, registrationId: registration.id } }),
                "Registration cancelled",
              );
            }}
            onCopyEmail={() => {
              void run(async () => {
                const email = await getConfirmationEmail({ data: { eventId, registrationId: registration.id } });
                if (!email) throw new Error("No confirmation email.");
                await navigator.clipboard.writeText(`To: ${email.to}\nSubject: ${email.subject}\n\n${email.body}`);
              }, "Copied");
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-display text-2xl tabular-nums">{value}</dd>
    </div>
  );
}

function CountTable({ headers, rows, empty }: { headers: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="text-muted">{empty}</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-line text-left text-ink-soft">
          {headers.map((header) => (
            <th key={header} className="py-2 pr-2 font-medium">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b border-line">
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="py-2 pr-2">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RegistrationCard({
  registration,
  canEdit,
  busy,
  renameId,
  givenName,
  familyName,
  onGivenName,
  onFamilyName,
  onStartRename,
  onStopRename,
  onSaveRename,
  onCancelAttendee,
  onCancelRegistration,
  onCopyEmail,
}: {
  registration: Registration;
  canEdit: boolean;
  busy: boolean;
  renameId: string | null;
  givenName: string;
  familyName: string;
  onGivenName: (value: string) => void;
  onFamilyName: (value: string) => void;
  onStartRename: (attendee: Attendee) => void;
  onStopRename: () => void;
  onSaveRename: (attendeeId: string) => void;
  onCancelAttendee: (attendee: Attendee) => void;
  onCancelRegistration: () => void;
  onCopyEmail: () => void;
}) {
  return (
    <article className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-xl">{registration.code}</p>
            <Badge tone={statusTone(registration.status)}>{registration.status.replaceAll("_", " ")}</Badge>
          </div>
          <p className="text-sm text-muted">{formatWhen(registration.createdAt, "date")}</p>
          <p>
            {registration.purchaserName} · {registration.purchaserEmail}
          </p>
          {registration.needsReview ? <p className="text-sm text-danger">{registration.needsReview}</p> : null}
          {registration.confirmationStatus === "held" ? <p className="text-sm text-muted">Held — not sent</p> : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {registration.status === "free" ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={onCancelRegistration}>
                Cancel registration
              </Button>
            ) : null}
            <Button type="button" variant="ghost" disabled={busy} onClick={onCopyEmail}>
              Copy confirmation email
            </Button>
          </div>
        ) : null}
      </div>
      <ul className="space-y-3">
        {registration.attendees.map((attendee) => (
          <li key={attendee.id} className={attendee.cancelled ? "text-muted line-through" : ""}>
            {renameId === attendee.id ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveRename(attendee.id);
                }}
              >
                <Input value={givenName} onChange={(event) => onGivenName(event.target.value)} aria-label="Given name" />
                <Input value={familyName} onChange={(event) => onFamilyName(event.target.value)} aria-label="Family name" />
                <Button type="submit" disabled={busy}>
                  Save
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={onStopRename}>
                  Cancel
                </Button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p>
                    {attendee.givenName} {attendee.familyName}
                    {attendee.review ? (
                      <span className="ml-2">
                        <Badge tone="warn">check</Badge>
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted">{attendee.tickets.join(", ") || "No ticket"}</p>
                  {attendee.dietary ? <p className="text-sm text-muted">{attendee.dietary}</p> : null}
                </div>
                {canEdit && isActiveRegistration(registration.status) && !attendee.cancelled ? (
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => onStartRename(attendee)}>
                      Rename
                    </Button>
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => onCancelAttendee(attendee)}>
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}
