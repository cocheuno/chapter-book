import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumbs } from "@/components/crumbs";
import { CopyPreview } from "@/components/copy-preview";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PERSON_ROLES } from "@/lib/crm/constants";
import { DEFAULT_TZ, fromDatetimeLocal, toDatetimeLocal } from "@/lib/crm/format";
import {
  getRegistrationSetup,
  removePart,
  removeTicketType,
  saveAgreement,
  savePart,
  saveRegistrationPage,
  saveTicketType,
  setBookRegistration,
} from "@/lib/crm/registration-setup";
import { formatCents, parsePriceCents, seatsLeft } from "@/lib/payments/pricing";
import { rememberVisit, useListHref } from "@/lib/nav/nav-store";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/$eventId/registration")({ component: RegistrationPage });

const AGREEMENTS = [
  { kind: "privacy", label: "Privacy notice" },
  { kind: "conduct", label: "Code of conduct" },
  { kind: "guardian", label: "Guardian consent" },
  { kind: "photo", label: "Photo release" },
] as const;

type Setup = Awaited<ReturnType<typeof getRegistrationSetup>>;

type PartDraft = {
  key: string;
  id: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  isMeal: boolean;
  sortOrder: number;
  held: number;
  taken: number;
};

type TicketDraft = {
  key: string;
  id: string | null;
  kind: "admission" | "add_on";
  name: string;
  description: string;
  price: string;
  forMinors: boolean;
  needsCode: boolean;
  salesStart: string;
  salesEnd: string;
  active: boolean;
  sortOrder: number;
  partIds: string[];
  paymentLink: string;
  savedPrice: string;
  savedPaymentLink: string;
  confirmPrice: string;
  issued: boolean;
  affiliationPrompt: string;
  personRole: string;
};

type PageDraft = {
  intro: string;
  forSchools: string;
  manageMessage: string;
  housingInfo: string;
  housingNights: string;
  refundPolicy: string;
  holdHours: string;
};

function holdHoursDraft(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (n < 1 || n > 336) return undefined;
  return n;
}

type AgreementDraft = {
  kind: (typeof AGREEMENTS)[number]["kind"];
  label: string;
  html: string;
  createdAt: string | null;
};

function dollarsText(cents: number): string {
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2);
}

function capacityDraft(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (n < 1) return undefined;
  return n;
}

function nextSort(items: { sortOrder: number }[]): number {
  if (!items.length) return 0;
  return Math.max(...items.map((item) => item.sortOrder)) + 1;
}

function versionOf(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Version of ${date.toLocaleDateString("en-CA", { timeZone })}`;
}

function toPartDrafts(data: Setup, timeZone: string): PartDraft[] {
  return data.parts.map((part) => ({
    key: part.id,
    id: part.id,
    title: part.title,
    startsAt: part.starts_at ? toDatetimeLocal(part.starts_at, timeZone) : "",
    endsAt: part.ends_at ? toDatetimeLocal(part.ends_at, timeZone) : "",
    capacity: part.capacity == null ? "" : String(part.capacity),
    isMeal: part.is_meal,
    sortOrder: part.sort_order,
    held: part.held,
    taken: part.taken,
  }));
}

function toTicketDrafts(data: Setup, timeZone: string): TicketDraft[] {
  return data.tickets.map((ticket) => ({
    key: ticket.id,
    id: ticket.id,
    kind: ticket.kind === "add_on" ? "add_on" : "admission",
    name: ticket.name,
    description: ticket.description ?? "",
    price: dollarsText(ticket.price_cents),
    forMinors: ticket.for_minors,
    needsCode: ticket.needs_code,
    salesStart: ticket.sales_start ? toDatetimeLocal(ticket.sales_start, timeZone) : "",
    salesEnd: ticket.sales_end ? toDatetimeLocal(ticket.sales_end, timeZone) : "",
    active: ticket.active,
    sortOrder: ticket.sort_order,
    partIds: ticket.partIds,
    paymentLink: ticket.payment_link ?? "",
    savedPrice: dollarsText(ticket.price_cents),
    savedPaymentLink: ticket.payment_link ?? "",
    confirmPrice: "",
    issued: ticket.issued,
    affiliationPrompt: ticket.affiliation_prompt ?? "",
    personRole: ticket.person_role ?? "",
  }));
}

function toAgreements(data: Setup): AgreementDraft[] {
  return AGREEMENTS.map((item) => {
    const row = data.agreements.find((agreement) => agreement.kind === item.kind);
    return { kind: item.kind, label: item.label, html: row?.html ?? "", createdAt: row?.created_at ?? null };
  });
}

function RegistrationPage() {
  return (
    <Gated>
      <RegistrationInner />
    </Gated>
  );
}

function RegistrationInner() {
  const { eventId } = Route.useParams();
  const eventsHref = useListHref("events", "/events");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [timeZone, setTimeZone] = useState(DEFAULT_TZ);
  const [parts, setParts] = useState<PartDraft[]>([]);
  const [tickets, setTickets] = useState<TicketDraft[]>([]);
  const [page, setPage] = useState<PageDraft>({
    intro: "",
    forSchools: "",
    manageMessage: "",
    housingInfo: "",
    housingNights: "",
    refundPolicy: "",
    holdHours: "",
  });
  const [bookOn, setBookOn] = useState(false);
  const [hostAllows, setHostAllows] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [spamCheck, setSpamCheck] = useState<"verify" | "skip" | "misconfigured">("skip");
  const [publicSlug, setPublicSlug] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<AgreementDraft[]>(
    AGREEMENTS.map((item) => ({ kind: item.kind, label: item.label, html: "", createdAt: null })),
  );

  const load = useCallback(() => {
    return getRegistrationSetup({ data: eventId }).then((data) => {
      const tz = data.event.timezone || DEFAULT_TZ;
      setTitle(data.event.title);
      setTimeZone(tz);
      setParts(toPartDrafts(data, tz));
      setTickets(toTicketDrafts(data, tz));
      setPage({
        intro: data.page.intro ?? "",
        forSchools: data.page.for_schools ?? "",
        manageMessage: data.page.manage_message ?? "",
        housingInfo: data.page.housing_info ?? "",
        housingNights: data.page.housing_nights ?? "",
        refundPolicy: data.page.refund_policy ?? "",
        holdHours: data.page.hold_hours == null ? "" : String(data.page.hold_hours),
      });
      setBookOn(data.page.use_book_registration);
      setHostAllows(data.bookRegistrationAllowed);
      setIsAdmin(data.isAdmin);
      setSpamCheck(data.spamCheck);
      setPublicSlug(data.event.slug);
      setAgreements(toAgreements(data));
      setReady(true);
    });
  }, [eventId]);

  useEffect(() => {
    let gone = false;
    setReady(false);
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
    const label = title.trim();
    if (!ready || !label) return;
    rememberVisit({ kind: "event", id: eventId, label, href: `/events/${eventId}` });
  }, [ready, title, eventId]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
      return;
    }
    toast.success("Saved");
    try {
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load");
    } finally {
      setBusy(false);
    }
  }

  function addPart() {
    setParts((list) => [
      ...list,
      {
        key: crypto.randomUUID(),
        id: null,
        title: "",
        startsAt: "",
        endsAt: "",
        capacity: "",
        isMeal: false,
        sortOrder: nextSort(list),
        held: 0,
        taken: 0,
      },
    ]);
  }

  function addTicket() {
    setTickets((list) => [
      ...list,
      {
        key: crypto.randomUUID(),
        id: null,
        kind: "admission",
        name: "",
        description: "",
        price: "0",
        forMinors: false,
        needsCode: false,
        salesStart: "",
        salesEnd: "",
        active: true,
        sortOrder: nextSort(list),
        partIds: [],
        paymentLink: "",
        savedPrice: "0",
        savedPaymentLink: "",
        confirmPrice: "",
        issued: false,
        affiliationPrompt: "",
        personRole: "",
      },
    ]);
  }

  if (!ready) return <p className="text-muted">{failed ? "Could not load registration setup." : "Loading…"}</p>;

  const savedParts = parts.filter((part) => part.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Crumbs
        trail={[
          { label: "Events", to: eventsHref },
          ...(title.trim() ? [{ label: title, to: `/events/${eventId}` }] : []),
          { label: "Registration setup" },
        ]}
      />
      <div className="flex flex-wrap gap-4">
        <Link to="/events/$eventId/registrations" params={{ eventId }} className="text-sm text-bronze hover:underline">
          Registrations
        </Link>
      </div>
      <header className="space-y-2">
        <h1 className="font-display text-3xl">Registration</h1>
        {title ? <p className="text-ink-soft">{title}</p> : null}
        <p className="rounded-xl border border-line bg-paper p-4 text-sm text-ink-soft">
          The public register page stays off until you turn on 'Use Chapter Book registration'.
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <p className="text-sm text-ink-soft">
          Turn this on when tickets, parts, page copy and agreements are ready. People fill in the form here, then
          pay with the ticket's Stripe payment link. Only an admin can turn it on.
        </p>
        {spamCheck === "verify" ? <p className="text-sm text-ink-soft">Spam check: on.</p> : null}
        {spamCheck === "skip" ? (
          <p className="text-sm text-ink-soft">Spam check: off on this test deployment.</p>
        ) : null}
        {spamCheck === "misconfigured" ? (
          <p className="text-sm text-danger">
            Spam check keys are missing on this deployment, so the register page stays closed.
          </p>
        ) : null}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={bookOn}
            disabled={busy || !hostAllows}
            onChange={(event) => {
              const next = event.target.checked;
              if (
                next &&
                !window.confirm(
                  "Turn on Chapter Book registration? The public page's Register button will open the book's register page.",
                )
              ) {
                return;
              }
              void run(() => setBookRegistration({ data: { eventId, enabled: next } }));
            }}
          />
          Use Chapter Book registration
        </label>
        {!hostAllows ? <p className="text-sm text-ink-soft">Turned off on this deployment.</p> : null}
        {bookOn && publicSlug ? (
          <>
            <p className="font-mono text-sm">/p/{publicSlug}/register</p>
            <p className="text-sm text-ink-soft">
              The GoDaddy card still uses the conference's Register link field. Change that field to this address if you
              want it there too.
            </p>
          </>
        ) : null}
        {publicSlug ? (
          <a href={`/p/${publicSlug}/register?preview=1`} className="text-sm text-bronze hover:underline">
            Preview the register page
          </a>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">Parts</h2>
          <Button type="button" variant="secondary" onClick={addPart} disabled={busy}>
            Add
          </Button>
        </div>
        {parts.map((part) => {
          const capacity = capacityDraft(part.capacity);
          const left = capacity === undefined ? null : seatsLeft({ capacity, held: part.held, taken: part.taken });
          const leftText = capacity === undefined ? "—" : left == null ? "no limit" : String(left);
          return (
            <div key={part.key} className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <Field label="Title">
                <Input
                  value={part.title}
                  onChange={(event) =>
                    setParts((list) => list.map((row) => (row.key === part.key ? { ...row, title: event.target.value } : row)))
                  }
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start">
                  <Input
                    type="datetime-local"
                    value={part.startsAt}
                    onChange={(event) =>
                      setParts((list) =>
                        list.map((row) => (row.key === part.key ? { ...row, startsAt: event.target.value } : row)),
                      )
                    }
                  />
                </Field>
                <Field label="End">
                  <Input
                    type="datetime-local"
                    value={part.endsAt}
                    onChange={(event) =>
                      setParts((list) =>
                        list.map((row) => (row.key === part.key ? { ...row, endsAt: event.target.value } : row)),
                      )
                    }
                  />
                </Field>
              </div>
              <Field label="Capacity">
                <Input
                  value={part.capacity}
                  inputMode="numeric"
                  placeholder="No limit"
                  onChange={(event) =>
                    setParts((list) =>
                      list.map((row) => (row.key === part.key ? { ...row, capacity: event.target.value } : row)),
                    )
                  }
                />
              </Field>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={part.isMeal}
                  onChange={(event) =>
                    setParts((list) =>
                      list.map((row) => (row.key === part.key ? { ...row, isMeal: event.target.checked } : row)),
                    )
                  }
                />
                Meal
              </label>
              <p className="text-sm text-muted">
                {part.held} held / {part.taken} taken / {leftText} left
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const parsed = capacityDraft(part.capacity);
                    if (parsed === undefined) {
                      toast.error("Capacity is a positive number, or empty for no limit.");
                      return;
                    }
                    if (!part.title.trim()) {
                      toast.error("Enter a title.");
                      return;
                    }
                    void run(() =>
                      savePart({
                        data: {
                          eventId,
                          ...(part.id ? { partId: part.id } : {}),
                          title: part.title,
                          startsAt: part.startsAt ? fromDatetimeLocal(part.startsAt, timeZone) : null,
                          endsAt: part.endsAt ? fromDatetimeLocal(part.endsAt, timeZone) : null,
                          capacity: parsed,
                          isMeal: part.isMeal,
                          sortOrder: part.sortOrder,
                        },
                      }),
                    );
                  }}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (!part.id) {
                      setParts((list) => list.filter((row) => row.key !== part.key));
                      return;
                    }
                    void run(() => removePart({ data: { eventId, partId: part.id! } }));
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">Tickets</h2>
          <Button type="button" variant="secondary" onClick={addTicket} disabled={busy}>
            Add
          </Button>
        </div>
        {tickets.map((ticket) => {
          const cents = parsePriceCents(ticket.price);
          return (
            <div key={ticket.key} className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <Field label="Name">
                <Input
                  value={ticket.name}
                  onChange={(event) =>
                    setTickets((list) =>
                      list.map((row) => (row.key === ticket.key ? { ...row, name: event.target.value } : row)),
                    )
                  }
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Kind">
                  <Select
                    value={ticket.kind}
                    onChange={(event) =>
                      setTickets((list) =>
                        list.map((row) =>
                          row.key === ticket.key
                            ? { ...row, kind: event.target.value === "add_on" ? "add_on" : "admission" }
                            : row,
                        ),
                      )
                    }
                  >
                    <option value="admission">Admission</option>
                    <option value="add_on">Add-on</option>
                  </Select>
                </Field>
                <Field label="Price">
                  <Input
                    value={ticket.price}
                    inputMode="decimal"
                    onChange={(event) =>
                      setTickets((list) =>
                        list.map((row) => (row.key === ticket.key ? { ...row, price: event.target.value } : row)),
                      )
                    }
                  />
                </Field>
              </div>
              {cents != null ? <p className="text-sm text-muted">{formatCents(cents)}</p> : null}
              {cents != null && cents > 0 ? (
                <Field label="Stripe payment link">
                  <Input
                    value={ticket.paymentLink}
                    inputMode="url"
                    placeholder="https://buy.stripe.com/…"
                    readOnly={!isAdmin}
                    onChange={(event) =>
                      setTickets((list) =>
                        list.map((row) => (row.key === ticket.key ? { ...row, paymentLink: event.target.value } : row)),
                      )
                    }
                  />
                </Field>
              ) : null}
              {cents != null && cents > 0 && !isAdmin ? (
                <p className="text-sm text-muted">Only an admin can set a payment link.</p>
              ) : null}
              {ticket.issued &&
              ((parsePriceCents(ticket.price) ?? -1) !== (parsePriceCents(ticket.savedPrice) ?? -2) ||
                ticket.paymentLink.trim() !== ticket.savedPaymentLink.trim()) ? (
                <Field label="Type the new price to confirm">
                  <Input
                    value={ticket.confirmPrice}
                    inputMode="decimal"
                    onChange={(event) =>
                      setTickets((list) =>
                        list.map((row) =>
                          row.key === ticket.key ? { ...row, confirmPrice: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </Field>
              ) : null}
              <Field label="Extra question for this ticket">
                <Input
                  value={ticket.affiliationPrompt}
                  maxLength={80}
                  placeholder="Your school"
                  onChange={(event) =>
                    setTickets((list) =>
                      list.map((row) =>
                        row.key === ticket.key ? { ...row, affiliationPrompt: event.target.value } : row,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Role in People">
                <Select
                  value={ticket.personRole}
                  onChange={(event) =>
                    setTickets((list) =>
                      list.map((row) => (row.key === ticket.key ? { ...row, personRole: event.target.value } : row)),
                    )
                  }
                >
                  <option value="">None</option>
                  {PERSON_ROLES.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Description">
                <Textarea
                  value={ticket.description}
                  onChange={(event) =>
                    setTickets((list) =>
                      list.map((row) => (row.key === ticket.key ? { ...row, description: event.target.value } : row)),
                    )
                  }
                />
              </Field>
              <p className="text-sm text-muted">Start with &lt;section&gt; for HTML.</p>
              <CopyPreview value={ticket.description} />
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={ticket.forMinors}
                    onChange={(event) =>
                      setTickets((list) =>
                        list.map((row) => (row.key === ticket.key ? { ...row, forMinors: event.target.checked } : row)),
                      )
                    }
                  />
                  For minors
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={ticket.needsCode}
                    onChange={(event) =>
                      setTickets((list) =>
                        list.map((row) => (row.key === ticket.key ? { ...row, needsCode: event.target.checked } : row)),
                      )
                    }
                  />
                  Needs a code
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={ticket.active}
                    onChange={(event) =>
                      setTickets((list) =>
                        list.map((row) => (row.key === ticket.key ? { ...row, active: event.target.checked } : row)),
                      )
                    }
                  />
                  Active
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Sales start">
                  <Input
                    type="datetime-local"
                    value={ticket.salesStart}
                    onChange={(event) =>
                      setTickets((list) =>
                        list.map((row) => (row.key === ticket.key ? { ...row, salesStart: event.target.value } : row)),
                      )
                    }
                  />
                </Field>
                <Field label="Sales end">
                  <Input
                    type="datetime-local"
                    value={ticket.salesEnd}
                    onChange={(event) =>
                      setTickets((list) =>
                        list.map((row) => (row.key === ticket.key ? { ...row, salesEnd: event.target.value } : row)),
                      )
                    }
                  />
                </Field>
              </div>
              {savedParts.length ? (
                <div className="space-y-1">
                  {savedParts.map((part) => (
                    <label key={part.id} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={part.id != null && ticket.partIds.includes(part.id)}
                        onChange={(event) => {
                          const partId = part.id;
                          if (!partId) return;
                          setTickets((list) =>
                            list.map((row) => {
                              if (row.key !== ticket.key) return row;
                              const partIds = event.target.checked
                                ? [...row.partIds, partId]
                                : row.partIds.filter((id) => id !== partId);
                              return { ...row, partIds };
                            }),
                          );
                        }}
                      />
                      {part.title || "Untitled part"}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Save a part first, then attach it here.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!ticket.name.trim()) {
                      toast.error("Enter a name.");
                      return;
                    }
                    if (parsePriceCents(ticket.price) == null) {
                      toast.error("Enter a price like 25 or 25.50.");
                      return;
                    }
                    const partIds = ticket.partIds.filter((id) => savedParts.some((part) => part.id === id));
                    void run(() =>
                      saveTicketType({
                        data: {
                          eventId,
                          ...(ticket.id ? { ticketTypeId: ticket.id } : {}),
                          kind: ticket.kind,
                          name: ticket.name,
                          description: ticket.description,
                          price: ticket.price,
                          forMinors: ticket.forMinors,
                          needsCode: ticket.needsCode,
                          salesStart: ticket.salesStart ? fromDatetimeLocal(ticket.salesStart, timeZone) : null,
                          salesEnd: ticket.salesEnd ? fromDatetimeLocal(ticket.salesEnd, timeZone) : null,
                          active: ticket.active,
                          sortOrder: ticket.sortOrder,
                          partIds,
                          ...(cents != null && cents > 0 && ticket.paymentLink.trim()
                            ? { paymentLink: ticket.paymentLink.trim() }
                            : {}),
                          ...(ticket.issued &&
                          ((parsePriceCents(ticket.price) ?? -1) !== (parsePriceCents(ticket.savedPrice) ?? -2) ||
                            ticket.paymentLink.trim() !== ticket.savedPaymentLink.trim())
                            ? { confirmPrice: ticket.confirmPrice }
                            : {}),
                          ...(ticket.affiliationPrompt.trim()
                            ? { affiliationPrompt: ticket.affiliationPrompt.trim() }
                            : {}),
                          ...(ticket.personRole ? { personRole: ticket.personRole } : {}),
                        },
                      }),
                    );
                  }}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (!ticket.id) {
                      setTickets((list) => list.filter((row) => row.key !== ticket.key));
                      return;
                    }
                    void run(() => removeTicketType({ data: { eventId, ticketTypeId: ticket.id! } }));
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Page copy</h2>
        <Field label="Intro">
          <Textarea value={page.intro} onChange={(event) => setPage({ ...page, intro: event.target.value })} />
        </Field>
        <CopyPreview value={page.intro} />
        <Field label="For schools">
          <Textarea
            value={page.forSchools}
            onChange={(event) => setPage({ ...page, forSchools: event.target.value })}
          />
        </Field>
        <CopyPreview value={page.forSchools} />
        <Field label="Message on the manage page">
          <Textarea
            value={page.manageMessage}
            onChange={(event) => setPage({ ...page, manageMessage: event.target.value })}
          />
        </Field>
        <CopyPreview value={page.manageMessage} />
        <Field label="Housing information">
          <Textarea
            value={page.housingInfo}
            onChange={(event) => setPage({ ...page, housingInfo: event.target.value })}
          />
        </Field>
        <p className="text-sm text-muted">Shown on the form. Start with &lt;section&gt; for HTML.</p>
        <CopyPreview value={page.housingInfo} />
        <Field label="Housing nights">
          <Textarea
            value={page.housingNights}
            onChange={(event) => setPage({ ...page, housingNights: event.target.value })}
          />
        </Field>
        <p className="text-sm text-muted">One night per line, for example Thursday, April 15. Up to 7.</p>
        <Field label="Refund policy">
          <Textarea
            value={page.refundPolicy}
            onChange={(event) => setPage({ ...page, refundPolicy: event.target.value })}
          />
        </Field>
        <p className="text-sm text-muted">Shown when a paid ticket is chosen. Start with &lt;section&gt; for HTML.</p>
        <CopyPreview value={page.refundPolicy} />
        <Field label="Hold unpaid registrations for (hours)">
          <Input
            type="number"
            min={1}
            max={336}
            step={1}
            value={page.holdHours}
            onChange={(event) => setPage({ ...page, holdHours: event.target.value })}
          />
        </Field>
        <p className="text-sm text-muted">Blank means 72 hours. Use 1 to 336.</p>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            const holdHours = holdHoursDraft(page.holdHours);
            if (holdHours === undefined) {
              toast.error("Hold hours must be a whole number from 1 to 336, or blank.");
              return;
            }
            void run(() =>
              saveRegistrationPage({
                data: {
                  eventId,
                  intro: page.intro,
                  forSchools: page.forSchools,
                  manageMessage: page.manageMessage,
                  housingInfo: page.housingInfo,
                  housingNights: page.housingNights,
                  refundPolicy: page.refundPolicy,
                  holdHours,
                },
              }),
            );
          }}
        >
          Save
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Agreements</h2>
        {agreements.map((agreement) => {
          const version = versionOf(agreement.createdAt, timeZone);
          return (
            <div key={agreement.kind} className="space-y-2 rounded-xl border border-line bg-surface p-4">
              <Field label={agreement.label}>
                <Textarea
                  value={agreement.html}
                  onChange={(event) =>
                    setAgreements((list) =>
                      list.map((row) => (row.kind === agreement.kind ? { ...row, html: event.target.value } : row)),
                    )
                  }
                />
              </Field>
              <CopyPreview value={agreement.html} />
              {version ? <p className="text-sm text-muted">{version}</p> : null}
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() => saveAgreement({ data: { eventId, kind: agreement.kind, html: agreement.html } }))
                }
              >
                Save new version
              </Button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
