import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumbs } from "@/components/crumbs";
import { Gated } from "@/components/gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  applyRegistrationChanges,
  cancelAttendee,
  cancelRegistration,
  dismissRegistrationChanges,
  markRegistrationPaid,
  refundRegistration,
  exportBadges,
  exportCatererCounts,
  exportHousingList,
  exportRegistrationAttendees,
  getConfirmationEmail,
  getConsentDetail,
  getRegistrationDesk,
  markPaperConsent,
  mintConsentLink,
  purgeConsentDetails,
  renameAttendee,
} from "@/lib/crm/registration-desk";
import { formatWhen } from "@/lib/crm/format";
import { paymentStateLabel } from "@/lib/payments/payment-link-rules";
import { DIETARY_TAGS, LODGING, type DietaryKey, type LodgingKey } from "@/lib/payments/registration-details";
import { formatCents } from "@/lib/payments/pricing";
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
  { id: "awaiting_payment", label: "Awaiting payment" },
  { id: "cancelled", label: "Cancelled" },
  { id: "needs_look", label: "Needs a look" },
  { id: "consent_missing", label: "Consent missing" },
];

type ConsentDetail = NonNullable<Awaited<ReturnType<typeof getConsentDetail>>>;

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
  const pendingChangeIds = data.registrations.flatMap((registration) =>
    registration.attendees.filter((attendee) => attendee.changes.length > 0).map((attendee) => attendee.id),
  );
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
          {pendingChangeIds.length ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("Apply all changes for this event?")) return;
                void run(
                  () => applyRegistrationChanges({ data: { eventId, attendeeIds: pendingChangeIds } }),
                  "Changes applied",
                );
              }}
            >
              Apply all changes
            </Button>
          ) : null}
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
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                downloadCsv(await exportHousingList({ data: eventId }));
              }, "Exported");
            }}
          >
            Housing list (CSV)
          </Button>
        </div>
      ) : null}

      {data.role === "admin" ? (
        <div className="space-y-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!data.event.purgeReady || busy}
            onClick={() => {
              if (!window.confirm("Delete medical notes and emergency contacts for this event?")) return;
              void run(() => purgeConsentDetails({ data: { eventId } }), "Medical and emergency details deleted");
            }}
          >
            Delete medical and emergency details
          </Button>
          {!data.event.purgeReady ? (
            <p className="text-sm text-muted">Available 30 days after the event's last day.</p>
          ) : null}
        </div>
      ) : null}

      {visible.length === 0 ? <p className="text-muted">No registrations match.</p> : null}
      <div className="space-y-4">
        {visible.map((registration) => (
          <RegistrationCard
            key={registration.id}
            eventId={eventId}
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
            onMarkPaid={(note) => {
              void run(
                () =>
                  markRegistrationPaid({
                    data: {
                      eventId,
                      registrationId: registration.id,
                      ...(note.trim() ? { note: note.trim() } : {}),
                    },
                  }),
                "Marked paid",
              );
            }}
            onRefund={() => {
              if (!window.confirm("Refunded in Stripe — cancel this registration?")) return;
              void run(
                () => refundRegistration({ data: { eventId, registrationId: registration.id } }),
                "Registration refunded",
              );
            }}
            onApplyChanges={(attendeeId) => {
              void run(
                () => applyRegistrationChanges({ data: { eventId, attendeeIds: [attendeeId] } }),
                "Changes applied",
              );
            }}
            onDismissChanges={(attendeeId) => {
              void run(
                () => dismissRegistrationChanges({ data: { eventId, attendeeId } }),
                "Changes dismissed",
              );
            }}
            onRefresh={() => {
              void load();
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

function AttendeeDetails({ attendee }: { attendee: Attendee }) {
  const details = attendee.details;
  const lines: string[] = [];
  if (details?.badgeName) lines.push(`Badge: ${details.badgeName}`);
  if (details?.position) lines.push(details.position);
  const place = [details?.city, details?.state].filter(Boolean).join(", ");
  if (place) lines.push(place);
  const tags = (details?.dietaryTags ?? [])
    .map((key) => DIETARY_TAGS[key as DietaryKey])
    .filter(Boolean);
  if (tags.length) lines.push(tags.join(", "));
  if (details?.lodging && details.lodging in LODGING) {
    const nights = details.nights.length ? ` (${details.nights.join(", ")})` : "";
    lines.push(`${LODGING[details.lodging as LodgingKey]}${nights}`);
  }
  if (details) {
    lines.push(`Room share: ${details.roomShare ? "Yes" : "No"}`);
    if (details.roommate) lines.push(`Roommate: ${details.roommate}`);
    lines.push(`Parking: ${details.parking ? "Yes" : "No"}`);
  }
  if (details?.notes) lines.push(details.notes);
  const emergency = [attendee.emergencyName, attendee.emergencyPhone].filter(Boolean).join(" · ");
  if (!lines.length && !emergency) return null;
  return (
    <div className="text-sm text-muted">
      {lines.map((line, index) => (
        <p key={`${index}-${line}`}>{line}</p>
      ))}
      {emergency ? <p>Emergency: {emergency}</p> : null}
    </div>
  );
}

function RegistrationCard({
  eventId,
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
  onMarkPaid,
  onRefund,
  onApplyChanges,
  onDismissChanges,
  onCopyEmail,
  onRefresh,
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
  onMarkPaid: (note: string) => void;
  onRefund: () => void;
  onApplyChanges: (attendeeId: string) => void;
  onDismissChanges: (attendeeId: string) => void;
  onCopyEmail: () => void;
  onRefresh: () => void;
  eventId: string;
}) {
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [paperFor, setPaperFor] = useState<string | null>(null);
  const [paperName, setPaperName] = useState("");
  const [paperPhone, setPaperPhone] = useState("");
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConsentDetail | null>(null);
  const [receiptNote, setReceiptNote] = useState("");
  const unpaid = registration.status === "free" || registration.status === "pending";

  return (
    <article className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-xl">{registration.code}</p>
            <Badge tone={statusTone(registration.status)}>{paymentStateLabel(registration.status)}</Badge>
          </div>
          <p className="text-sm text-muted">{formatCents(registration.totalCents)}</p>
          <p className="text-sm text-muted">{formatWhen(registration.createdAt, "date")}</p>
          <p>
            {registration.purchaserName} · {registration.purchaserEmail}
          </p>
          {registration.needsReview ? <p className="text-sm text-danger">{registration.needsReview}</p> : null}
          {registration.confirmationStatus === "held" ? <p className="text-sm text-muted">Held — not sent</p> : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {unpaid ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={onCancelRegistration}>
                Cancel registration
              </Button>
            ) : null}
            {registration.status === "pending" ? (
              <div className="space-y-2">
                <label className="block text-sm text-ink-soft">
                  Stripe receipt or note
                  <Input
                    value={receiptNote}
                    maxLength={200}
                    aria-label="Stripe receipt or note"
                    onChange={(event) => setReceiptNote(event.target.value)}
                  />
                </label>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => onMarkPaid(receiptNote)}>
                  Mark paid
                </Button>
              </div>
            ) : null}
            {registration.status === "paid" ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={onRefund}>
                Refunded in Stripe — cancel
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
                  <AttendeeDetails attendee={attendee} />
                </div>
                {canEdit && isActiveRegistration(registration.status) && !attendee.cancelled ? (
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => onStartRename(attendee)}>
                      Rename
                    </Button>
                    {unpaid ? (
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => onCancelAttendee(attendee)}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
            {attendee.changesWaiting ? <p className="text-sm">Changes waiting for an editor</p> : null}
            {attendee.changes.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Changes to review</p>
                <ul className="space-y-1">
                  {attendee.changes.map((line) => (
                    <li key={line.field} className="text-sm">
                      {line.label}: {line.stored} → {line.typed}
                    </li>
                  ))}
                </ul>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onApplyChanges(attendee.id)}
                    >
                      Apply
                    </Button>
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => onDismissChanges(attendee.id)}>
                      Dismiss
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {attendee.isMinor ? (
              <p className={attendee.consentOnFile ? "text-sm font-medium text-ok" : "text-sm font-medium text-danger"}>
                {attendee.consentOnFile ? "Consent on file" : "Consent missing"}
              </p>
            ) : null}
            {canEdit && attendee.isMinor && !attendee.cancelled ? (
              <div className="flex flex-wrap gap-2">
                {attendee.consentOnFile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      void getConsentDetail({ data: { eventId, attendeeId: attendee.id } })
                        .then((row) => {
                          if (!row) {
                            toast.error("No consent on file.");
                            return;
                          }
                          setDetail(row);
                          setDetailFor(attendee.id);
                        })
                        .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load consent"));
                    }}
                  >
                    View consent
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        void mintConsentLink({ data: { eventId, attendeeId: attendee.id } })
                          .then(async (result) => {
                            const url = `${window.location.origin}${result.path}`;
                            setLinkFor(attendee.id);
                            setLinkUrl(url);
                            try {
                              await navigator.clipboard.writeText(url);
                            } catch {
                              // The field below still shows the link.
                            }
                            toast.success("Consent link copied");
                          })
                          .catch((err) => toast.error(err instanceof Error ? err.message : "Could not make a consent link"));
                      }}
                    >
                      Copy consent link
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setPaperFor(attendee.id);
                        setPaperName("");
                        setPaperPhone("");
                      }}
                    >
                      Mark paper consent received
                    </Button>
                  </>
                )}
              </div>
            ) : null}
            {linkFor === attendee.id ? <Input readOnly value={linkUrl} aria-label="Consent link" /> : null}
            {paperFor === attendee.id ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void markPaperConsent({
                    data: {
                      eventId,
                      attendeeId: attendee.id,
                      guardianName: paperName,
                      guardianPhone: paperPhone,
                    },
                  })
                    .then(() => {
                      setPaperFor(null);
                      toast.success("Paper consent received");
                      onRefresh();
                    })
                    .catch((err) => toast.error(err instanceof Error ? err.message : "Could not save consent"));
                }}
              >
                <Input
                  value={paperName}
                  onChange={(event) => setPaperName(event.target.value)}
                  aria-label="Guardian name"
                  placeholder="Guardian name"
                  required
                />
                <Input
                  value={paperPhone}
                  onChange={(event) => setPaperPhone(event.target.value)}
                  aria-label="Guardian phone"
                  placeholder="Guardian phone"
                  required
                />
                <Button type="submit" disabled={busy}>
                  Save paper consent
                </Button>
              </form>
            ) : null}
            {detailFor === attendee.id && detail ? (
              <dl className="space-y-1 text-sm">
                <div>Guardian: {detail.guardianName}</div>
                <div>Phone: {detail.guardianPhone}</div>
                {detail.guardianEmail ? <div>Email: {detail.guardianEmail}</div> : null}
                {detail.relationship ? <div>Relationship: {detail.relationship}</div> : null}
                {detail.emergencyName || detail.emergencyPhone ? (
                  <div>
                    Emergency: {[detail.emergencyName, detail.emergencyPhone].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
                {detail.medicalNotes ? <div>Medical notes: {detail.medicalNotes}</div> : null}
                <div>Photo release: {detail.photoRelease ? "Yes" : "No"}</div>
                <div>Method: {detail.method}</div>
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}
