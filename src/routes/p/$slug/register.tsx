import { createFileRoute, notFound } from "@tanstack/react-router";
import { PublicCopy } from "@/components/public-copy";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { createRegistration, getRegisterPage, getRegisterPreview } from "@/lib/crm/registration-public";
import { guardianConsentErrors } from "@/lib/payments/consent-rules";
import { MAX_ATTENDEES } from "@/lib/payments/registration-rules";
import { formatCents } from "@/lib/payments/pricing";
import { useEffect, useRef, useState, type FormEvent } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void },
      ) => string;
      remove?: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const AGREEMENT_LABEL: Record<string, string> = {
  privacy: "I agree to the privacy notice",
  refund: "I agree to the refund policy",
  conduct: "I agree to the code of conduct",
};

type RegisterData = NonNullable<Awaited<ReturnType<typeof getRegisterPreview>>>;
type Ticket = RegisterData["tickets"][number];

type AttendeeDraft = {
  key: string;
  givenName: string;
  familyName: string;
  email: string;
  badgeAffiliation: string;
  dietary: string;
  accessibility: string;
  admissionId: string;
  addOnIds: string[];
  under18: boolean;
  consent: "now" | "later";
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  relationship: string;
  emergencyName: string;
  emergencyPhone: string;
  medicalNotes: string;
  photoRelease: boolean;
  agreed: boolean;
  signature: string;
};

export const Route = createFileRoute("/p/$slug/register")({
  loader: async ({ params, location }) => {
    const preview = new URLSearchParams(location.searchStr).get("preview") === "1";
    const page = preview
      ? await getRegisterPreview({ data: params.slug })
      : await getRegisterPage({ data: params.slug });
    if (!page) throw notFound();
    return { page, preview };
  },
  head: ({ loaderData }) =>
    loaderData ? { meta: [{ title: `Register · ${loaderData.page.event.title}` }] } : {},
  notFoundComponent: RegisterMissing,
  errorComponent: RegisterUnavailable,
  component: RegisterPage,
});

function RegisterMissing() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <p>That page is not published.</p>
    </main>
  );
}

function RegisterUnavailable() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <p>This page is not available right now. Please try again shortly.</p>
    </main>
  );
}

function emptyAttendee(key = "person-1"): AttendeeDraft {
  return {
    key,
    givenName: "",
    familyName: "",
    email: "",
    badgeAffiliation: "",
    dietary: "",
    accessibility: "",
    admissionId: "",
    addOnIds: [],
    under18: false,
    consent: "now",
    guardianName: "",
    guardianPhone: "",
    guardianEmail: "",
    relationship: "",
    emergencyName: "",
    emergencyPhone: "",
    medicalNotes: "",
    photoRelease: false,
    agreed: false,
    signature: "",
  };
}

function splitName(name: string): { givenName: string; familyName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { givenName: parts[0] ?? "", familyName: parts.slice(1).join(" ") };
}

function ticketBlocked(ticket: Ticket, guardianOpen: boolean): boolean {
  if (ticket.price_cents > 0 || ticket.full || !ticket.onSale || ticket.needs_code) return true;
  return ticket.for_minors && !guardianOpen;
}

function ticketNote(ticket: Ticket, guardianOpen: boolean): string | null {
  if (ticket.price_cents > 0) return `${formatCents(ticket.price_cents)} · Online payment opens soon`;
  if (ticket.full) return "Full";
  if (!ticket.onSale) return "Not on sale";
  if (ticket.needs_code || (ticket.for_minors && !guardianOpen)) return "Not available";
  return formatCents(ticket.price_cents);
}

function GuardianFields({
  person,
  html,
  onChange,
}: {
  person: AttendeeDraft;
  html: string;
  onChange: (patch: Partial<AttendeeDraft>) => void;
}) {
  const now = person.consent !== "later";
  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="sr-only">Who is completing consent</legend>
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="radio"
            className="mt-1 size-5"
            name={`consent-${person.key}`}
            checked={now}
            onChange={() => onChange({ consent: "now" })}
          />
          A parent or guardian is completing this now
        </label>
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="radio"
            className="mt-1 size-5"
            name={`consent-${person.key}`}
            checked={!now}
            onChange={() => onChange({ consent: "later" })}
          />
          A teacher is registering; the parent will sign a consent link later
        </label>
      </fieldset>
      {now ? (
        <div className="space-y-3">
          <Field label="Guardian name">
            <Input
              value={person.guardianName}
              autoComplete="name"
              required
              onChange={(event) => onChange({ guardianName: event.target.value })}
            />
          </Field>
          <Field label="Guardian phone">
            <Input
              value={person.guardianPhone}
              autoComplete="tel"
              required
              onChange={(event) => onChange({ guardianPhone: event.target.value })}
            />
          </Field>
          <Field label="Guardian email">
            <Input
              type="email"
              value={person.guardianEmail}
              autoComplete="email"
              required
              onChange={(event) => onChange({ guardianEmail: event.target.value })}
            />
          </Field>
          <Field label="Relationship to the student">
            <Input
              value={person.relationship}
              required
              onChange={(event) => onChange({ relationship: event.target.value })}
            />
          </Field>
          <Field label="Emergency contact name">
            <Input
              value={person.emergencyName}
              required
              onChange={(event) => onChange({ emergencyName: event.target.value })}
            />
          </Field>
          <Field label="Emergency contact phone">
            <Input
              value={person.emergencyPhone}
              autoComplete="tel"
              required
              onChange={(event) => onChange({ emergencyPhone: event.target.value })}
            />
          </Field>
          <Field label="Medical notes (optional)">
            <Textarea value={person.medicalNotes} onChange={(event) => onChange({ medicalNotes: event.target.value })} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink-soft">Photo release</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                className="size-5"
                name={`photo-${person.key}`}
                checked={person.photoRelease}
                onChange={() => onChange({ photoRelease: true })}
              />
              Yes
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                className="size-5"
                name={`photo-${person.key}`}
                checked={!person.photoRelease}
                onChange={() => onChange({ photoRelease: false })}
              />
              No
            </label>
          </fieldset>
          <div className="max-h-48 overflow-auto rounded-md border border-line bg-surface p-3">
            <PublicCopy text={html} className="text-sm text-ink-soft" />
          </div>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-5"
              required
              checked={person.agreed}
              onChange={(event) => onChange({ agreed: event.target.checked })}
            />
            I am this student's parent or legal guardian and I agree
          </label>
          <Field label="Type your full name to sign">
            <Input value={person.signature} required onChange={(event) => onChange({ signature: event.target.value })} />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

function RegisterPage() {
  const { page, preview } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const [purchaserName, setPurchaserName] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [purchaserPhone, setPurchaserPhone] = useState("");
  const [self, setSelf] = useState(true);
  const [attendees, setAttendees] = useState<AttendeeDraft[]>([emptyAttendee()]);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [newsOptIn, setNewsOptIn] = useState(false);
  const [heardFrom, setHeardFrom] = useState("");
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const guardianOpen = Boolean(page.guardianConsent);
  const minorBlocked = attendees.some((person) => person.under18) && !guardianOpen;

  useEffect(() => {
    const sitekey = page.turnstileSiteKey;
    const el = turnstileRef.current;
    if (!sitekey || !el) return;
    let cancelled = false;
    let widgetId = "";
    const render = () => {
      if (cancelled || !window.turnstile || !turnstileRef.current) return;
      widgetId = window.turnstile.render(turnstileRef.current, {
        sitekey,
        callback: (token: string) => setTurnstileToken(token),
      });
    };
    let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    if (window.turnstile) render();
    else {
      if (!script) {
        script = document.createElement("script");
        script.src = TURNSTILE_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      cancelled = true;
      script?.removeEventListener("load", render);
      if (widgetId) window.turnstile?.remove?.(widgetId);
    };
  }, [page.turnstileSiteKey]);

  function fillSelf(list: AttendeeDraft[], name: string, email: string): AttendeeDraft[] {
    const split = splitName(name);
    return list.map((row, index) => (index === 0 ? { ...row, ...split, email } : row));
  }

  function updatePurchaserName(name: string) {
    setPurchaserName(name);
    if (self) setAttendees((list) => fillSelf(list, name, purchaserEmail));
  }

  function updatePurchaserEmail(email: string) {
    setPurchaserEmail(email);
    if (self) setAttendees((list) => fillSelf(list, purchaserName, email));
  }

  function updateAttendee(key: string, patch: Partial<AttendeeDraft>) {
    setAttendees((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (attendees.some((person) => person.under18) && !page.guardianConsent) {
      setError("Registration for students under 18 is not open yet.");
      return;
    }
    for (const person of attendees) {
      if (!person.under18 || person.consent === "later") continue;
      const message = guardianConsentErrors({
        guardianName: person.guardianName,
        guardianPhone: person.guardianPhone,
        guardianEmail: person.guardianEmail,
        relationship: person.relationship,
        emergencyName: person.emergencyName,
        emergencyPhone: person.emergencyPhone,
        medicalNotes: person.medicalNotes,
        photoRelease: person.photoRelease,
        agreed: person.agreed,
        signature: person.signature,
      })[0];
      if (message) {
        setError(message);
        return;
      }
    }
    setBusy(true);
    try {
      const utmSource = new URLSearchParams(window.location.search).get("utm_source") ?? undefined;
      const result = await createRegistration({
        data: {
          slug,
          purchaser: {
            name: purchaserName,
            email: purchaserEmail,
            ...(purchaserPhone.trim() ? { phone: purchaserPhone.trim() } : {}),
          },
          attendees: attendees.map((person) => ({
            givenName: person.givenName,
            familyName: person.familyName,
            ...(person.email.trim() ? { email: person.email.trim() } : {}),
            under18: person.under18,
            admissionId: person.admissionId,
            addOnIds: person.addOnIds,
            ...(person.under18
              ? person.consent === "later"
                ? { consent: "later" as const }
                : {
                    consent: "now" as const,
                    guardianName: person.guardianName.trim(),
                    guardianPhone: person.guardianPhone.trim(),
                    ...(person.guardianEmail.trim() ? { guardianEmail: person.guardianEmail.trim() } : {}),
                    relationship: person.relationship.trim(),
                    emergencyName: person.emergencyName.trim(),
                    emergencyPhone: person.emergencyPhone.trim(),
                    ...(person.medicalNotes.trim() ? { medicalNotes: person.medicalNotes.trim() } : {}),
                    photoRelease: person.photoRelease,
                    agreed: person.agreed,
                    signature: person.signature.trim(),
                  }
              : {}),
            ...(person.badgeAffiliation.trim() ? { badgeAffiliation: person.badgeAffiliation.trim() } : {}),
            ...(person.dietary.trim() ? { dietary: person.dietary.trim() } : {}),
            ...(person.accessibility.trim() ? { accessibility: person.accessibility.trim() } : {}),
          })),
          acceptedAgreementIds: page.agreements.filter((item) => accepted[item.id]).map((item) => item.id),
          newsOptIn,
          ...(heardFrom.trim() ? { heardFrom: heardFrom.trim() } : {}),
          ...(utmSource ? { utmSource } : {}),
          website,
          ...(turnstileToken ? { turnstileToken } : {}),
        },
      });
      window.location.assign(result.manageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration could not be completed. Please try again.");
      setBusy(false);
    }
  }

  const admissions = page.tickets.filter((ticket) => ticket.kind === "admission");
  const addOns = page.tickets.filter((ticket) => ticket.kind === "add_on");

  return (
    <div className="min-h-dvh bg-paper text-ink">
      {preview && !page.enabled ? (
        <div className="bg-bronze px-4 py-2 text-center text-sm font-medium text-bronze-fg">
          Preview: registration is off. People can't see or submit this page.
        </div>
      ) : null}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <a href="/site" className="font-display text-base leading-tight sm:text-lg">
            {page.public_title || "Society of Catholic Scientists"}
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div className="space-y-2">
          <h1 className="font-display text-4xl">{page.event.title}</h1>
          {page.event.when_label ? <p className="text-sm text-muted">{page.event.when_label}</p> : null}
          {page.event.location ? <p className="text-sm text-ink-soft">{page.event.location}</p> : null}
        </div>
        <PublicCopy text={page.intro} className="text-lg leading-relaxed text-ink-soft" />
        <form className="space-y-8" onSubmit={onSubmit}>
          <section className="space-y-3">
            <h2 className="font-display text-2xl">Purchaser</h2>
            <Field label="Name">
              <Input value={purchaserName} autoComplete="name" required onChange={(event) => updatePurchaserName(event.target.value)} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={purchaserEmail}
                autoComplete="email"
                required
                onChange={(event) => updatePurchaserEmail(event.target.value)}
              />
            </Field>
            <Field label="Phone (optional)">
              <Input value={purchaserPhone} autoComplete="tel" onChange={(event) => setPurchaserPhone(event.target.value)} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={self}
                onChange={(event) => {
                  const next = event.target.checked;
                  setSelf(next);
                  if (next) setAttendees((list) => fillSelf(list, purchaserName, purchaserEmail));
                }}
              />
              I'm registering myself
            </label>
          </section>

          {attendees.map((person, index) => (
            <section key={person.key} className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl">Person {index + 1}</h2>
                {attendees.length > 1 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setAttendees((list) => {
                        const next = list.filter((row) => row.key !== person.key);
                        if (self && index === 0 && next[0]) {
                          const split = splitName(purchaserName);
                          next[0] = { ...next[0], ...split, email: purchaserEmail };
                        }
                        return next;
                      })
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <Input
                    value={person.givenName}
                    autoComplete="given-name"
                    required
                    onChange={(event) => updateAttendee(person.key, { givenName: event.target.value })}
                  />
                </Field>
                <Field label="Last name">
                  <Input
                    value={person.familyName}
                    autoComplete="family-name"
                    required
                    onChange={(event) => updateAttendee(person.key, { familyName: event.target.value })}
                  />
                </Field>
              </div>
              <Field label="Email (optional)">
                <Input
                  type="email"
                  value={person.email}
                  autoComplete="email"
                  onChange={(event) => updateAttendee(person.key, { email: event.target.value })}
                />
              </Field>
              <Field label="Badge affiliation">
                <Input
                  value={person.badgeAffiliation}
                  onChange={(event) => updateAttendee(person.key, { badgeAffiliation: event.target.value })}
                />
              </Field>
              <Field label="Dietary needs">
                <Input value={person.dietary} onChange={(event) => updateAttendee(person.key, { dietary: event.target.value })} />
              </Field>
              <Field label="Accessibility needs">
                <Textarea
                  value={person.accessibility}
                  onChange={(event) => updateAttendee(person.key, { accessibility: event.target.value })}
                />
              </Field>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-ink-soft">Admission</legend>
                {admissions.map((ticket) => {
                  const blocked = ticketBlocked(ticket, guardianOpen);
                  const note = ticketNote(ticket, guardianOpen);
                  return (
                    <label key={ticket.id} className="block">
                      <span className="flex min-h-11 items-start gap-2 text-sm">
                        <input
                          type="radio"
                          className="mt-1 size-5"
                          name={`admission-${person.key}`}
                          checked={person.admissionId === ticket.id}
                          disabled={blocked}
                          required
                          onChange={() =>
                            updateAttendee(person.key, {
                              admissionId: ticket.id,
                              ...(ticket.for_minors ? { under18: true } : {}),
                            })
                          }
                        />
                        <span>
                          {ticket.name}
                          {note ? <span className="text-muted"> · {note}</span> : null}
                        </span>
                      </span>
                      {ticket.description ? (
                        <PublicCopy text={ticket.description} className="mt-1 pl-7 text-sm text-ink-soft" />
                      ) : null}
                    </label>
                  );
                })}
              </fieldset>
              {addOns.length ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-ink-soft">Add-ons</legend>
                  {addOns.map((ticket) => {
                    const blocked = ticketBlocked(ticket, guardianOpen);
                    const note = ticketNote(ticket, guardianOpen);
                    const checked = person.addOnIds.includes(ticket.id);
                    return (
                      <label key={ticket.id} className="block">
                        <span className="flex min-h-11 items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1 size-5"
                            checked={checked}
                            disabled={blocked}
                            onChange={() =>
                              updateAttendee(person.key, {
                                addOnIds: checked
                                  ? person.addOnIds.filter((id) => id !== ticket.id)
                                  : [...person.addOnIds, ticket.id],
                                ...(!checked && ticket.for_minors ? { under18: true } : {}),
                              })
                            }
                          />
                          <span>
                            {ticket.name}
                            {note ? <span className="text-muted"> · {note}</span> : null}
                          </span>
                        </span>
                        {ticket.description ? (
                          <PublicCopy text={ticket.description} className="mt-1 pl-7 text-sm text-ink-soft" />
                        ) : null}
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={person.under18}
                  onChange={(event) => {
                    const under18 = event.target.checked;
                    if (under18) {
                      updateAttendee(person.key, { under18: true });
                      return;
                    }
                    const admission = page.tickets.find((ticket) => ticket.id === person.admissionId);
                    updateAttendee(person.key, {
                      under18: false,
                      consent: "now",
                      admissionId: admission?.for_minors ? "" : person.admissionId,
                      addOnIds: person.addOnIds.filter((id) => !page.tickets.find((ticket) => ticket.id === id)?.for_minors),
                    });
                  }}
                />
                Under 18
              </label>
              {person.under18 ? (
                page.guardianConsent ? (
                  <GuardianFields
                    person={person}
                    html={page.guardianConsent.html}
                    onChange={(patch) => updateAttendee(person.key, patch)}
                  />
                ) : (
                  <p className="text-sm text-ink-soft">Registration for students under 18 is not open yet.</p>
                )
              ) : null}
            </section>
          ))}

          {attendees.length < MAX_ATTENDEES ? (
            <Button type="button" variant="secondary" onClick={() => setAttendees((list) => [...list, emptyAttendee(crypto.randomUUID())])}>
              Add a person
            </Button>
          ) : null}

          {page.agreements.map((agreement) => (
            <section key={agreement.id} className="space-y-3">
              <div className="max-h-48 overflow-auto rounded-md border border-line bg-surface p-3">
                <PublicCopy text={agreement.html} className="text-sm text-ink-soft" />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  required
                  checked={Boolean(accepted[agreement.id])}
                  onChange={(event) => setAccepted((current) => ({ ...current, [agreement.id]: event.target.checked }))}
                />
                {AGREEMENT_LABEL[agreement.kind] ?? "I agree"}
              </label>
            </section>
          ))}

          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={newsOptIn}
              onChange={(event) => setNewsOptIn(event.target.checked)}
            />
            Send me news about future chapter events
          </label>
          <Field label="How did you hear about us?">
            <Input value={heardFrom} onChange={(event) => setHeardFrom(event.target.value)} />
          </Field>
          <div className="absolute h-0 w-0 overflow-hidden" aria-hidden="true">
            <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
          </div>
          {page.turnstileSiteKey ? <div ref={turnstileRef} /> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" disabled={busy || minorBlocked}>
            Register
          </Button>
        </form>
        <PublicCopy text={page.for_schools} className="text-lg leading-relaxed text-ink-soft" />
      </main>
    </div>
  );
}
