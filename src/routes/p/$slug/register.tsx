import { createFileRoute, notFound } from "@tanstack/react-router";
import { PublicCopy } from "@/components/public-copy";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createRegistration, getRegisterPage, getRegisterPreview } from "@/lib/crm/registration-public";
import { guardianConsentErrors } from "@/lib/payments/consent-rules";
import {
  DIETARY_TAG_KEYS,
  DIETARY_TAGS,
  LODGING,
  LODGING_KEYS,
  TITLES,
  detailsErrors,
  nightOptions,
  type DietaryKey,
  type LodgingKey,
} from "@/lib/payments/registration-details";
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
  title: string;
  givenName: string;
  familyName: string;
  badgeName: string;
  email: string;
  position: string;
  badgeAffiliation: string;
  city: string;
  state: string;
  dietaryTags: DietaryKey[];
  dietary: string;
  lodging: "" | LodgingKey;
  nights: string[];
  roomShare: boolean;
  roommate: string;
  parking: boolean;
  accessibility: string;
  notes: string;
  refundAcknowledged: boolean;
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
    title: "",
    givenName: "",
    familyName: "",
    badgeName: "",
    email: "",
    position: "",
    badgeAffiliation: "",
    city: "",
    state: "",
    dietaryTags: [],
    dietary: "",
    lodging: "",
    nights: [],
    roomShare: false,
    roommate: "",
    parking: false,
    accessibility: "",
    notes: "",
    refundAcknowledged: false,
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
  if (ticket.price_cents > 0 && !ticket.hasPaymentLink) return true;
  if (ticket.full || !ticket.onSale || ticket.needs_code) return true;
  return ticket.for_minors && !guardianOpen;
}

function ticketNote(ticket: Ticket, guardianOpen: boolean): string | null {
  if (ticket.price_cents > 0 && !ticket.hasPaymentLink) {
    return `${formatCents(ticket.price_cents)} · Online payment opens soon`;
  }
  if (ticket.full) return "Full";
  if (!ticket.onSale) return "Not on sale";
  if (ticket.needs_code || (ticket.for_minors && !guardianOpen)) return "Not available";
  return formatCents(ticket.price_cents);
}

type Confirmation = {
  code: string;
  manageUrl: string;
  status: string;
  totalCents: number;
  payUrl?: string;
};

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

function SectionHeading({ children }: { children: string }) {
  return <h3 className="font-display text-xl">{children}</h3>;
}

function PersonFields({
  person,
  admissions,
  addOns,
  tickets,
  guardianOpen,
  guardianHtml,
  housingInfo,
  nights,
  onChange,
}: {
  person: AttendeeDraft;
  admissions: Ticket[];
  addOns: Ticket[];
  tickets: Ticket[];
  guardianOpen: boolean;
  guardianHtml: string | null;
  housingInfo: string | null;
  nights: string[];
  onChange: (patch: Partial<AttendeeDraft>) => void;
}) {
  const admission = admissions.find((ticket) => ticket.id === person.admissionId);
  const affiliationLabel = admission?.affiliation_prompt?.trim() || "Affiliation";
  const affiliationRequired = Boolean(admission?.affiliation_prompt?.trim());
  const askNights = person.lodging === "hotel_block" || person.lodging === "need_help";
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionHeading>About you</SectionHeading>
        <Field label="Title">
          <Select value={person.title} onChange={(event) => onChange({ title: event.target.value })}>
            {TITLES.map((title) => (
              <option key={title || "none"} value={title}>
                {title || "—"}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">
            <Input
              value={person.givenName}
              autoComplete="given-name"
              required
              onChange={(event) => onChange({ givenName: event.target.value })}
            />
          </Field>
          <Field label="Last name">
            <Input
              value={person.familyName}
              autoComplete="family-name"
              required
              onChange={(event) => onChange({ familyName: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Name on badge">
          <Input
            value={person.badgeName}
            maxLength={60}
            placeholder={person.givenName.trim() || "First name"}
            onChange={(event) => onChange({ badgeName: event.target.value })}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={person.email}
            autoComplete="email"
            onChange={(event) => onChange({ email: event.target.value })}
          />
        </Field>
        <Field label="Position or role (optional)">
          <Input
            value={person.position}
            maxLength={120}
            onChange={(event) => onChange({ position: event.target.value })}
          />
        </Field>
        <Field label={affiliationLabel}>
          <Input
            value={person.badgeAffiliation}
            required={affiliationRequired}
            maxLength={200}
            onChange={(event) => onChange({ badgeAffiliation: event.target.value })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City">
            <Input
              value={person.city}
              maxLength={100}
              autoComplete="address-level2"
              onChange={(event) => onChange({ city: event.target.value })}
            />
          </Field>
          <Field label="State">
            <Input
              value={person.state}
              maxLength={50}
              autoComplete="address-level1"
              onChange={(event) => onChange({ state: event.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-3">
        <SectionHeading>Ticket</SectionHeading>
        <fieldset className="space-y-2">
          <legend className="sr-only">Admission</legend>
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
                      onChange({
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
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={person.under18}
            onChange={(event) => {
              const under18 = event.target.checked;
              if (under18) {
                onChange({ under18: true });
                return;
              }
              onChange({
                under18: false,
                consent: "now",
                admissionId: admission?.for_minors ? "" : person.admissionId,
                addOnIds: person.addOnIds.filter((id) => !tickets.find((ticket) => ticket.id === id)?.for_minors),
              });
            }}
          />
          Under 18
        </label>
        {person.under18 ? (
          guardianHtml ? (
            <GuardianFields person={person} html={guardianHtml} onChange={onChange} />
          ) : (
            <p className="text-sm text-ink-soft">Registration for students under 18 is not open yet.</p>
          )
        ) : null}
      </div>

      <div className="space-y-3">
        <SectionHeading>Meals</SectionHeading>
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
                        onChange({
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
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-soft">Dietary needs</legend>
          {DIETARY_TAG_KEYS.map((key) => {
            const checked = person.dietaryTags.includes(key);
            const full = person.dietaryTags.length >= 7 && !checked;
            return (
              <label key={key} className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-5"
                  checked={checked}
                  disabled={full}
                  onChange={() =>
                    onChange({
                      dietaryTags: checked
                        ? person.dietaryTags.filter((tag) => tag !== key)
                        : [...person.dietaryTags, key],
                    })
                  }
                />
                {DIETARY_TAGS[key]}
              </label>
            );
          })}
        </fieldset>
        <Field label="Allergies or other dietary needs">
          <Input value={person.dietary} maxLength={500} onChange={(event) => onChange({ dietary: event.target.value })} />
        </Field>
      </div>

      {housingInfo?.trim() ? (
        <div className="space-y-3">
          <SectionHeading>Housing</SectionHeading>
          <PublicCopy text={housingInfo} className="text-sm text-ink-soft" />
          <fieldset className="space-y-2">
            <legend className="sr-only">Lodging</legend>
            {LODGING_KEYS.map((key) => (
              <label key={key} className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-1 size-5"
                  name={`lodging-${person.key}`}
                  checked={person.lodging === key}
                  required
                  onChange={() =>
                    onChange({
                      lodging: key,
                      ...(key === "hotel_block" || key === "need_help" ? {} : { nights: [] }),
                    })
                  }
                />
                {LODGING[key]}
              </label>
            ))}
          </fieldset>
          {askNights && nights.length ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink-soft">Nights</legend>
              {nights.map((night) => {
                const checked = person.nights.includes(night);
                return (
                  <label key={night} className="flex min-h-11 items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-5"
                      checked={checked}
                      onChange={() =>
                        onChange({
                          nights: checked ? person.nights.filter((item) => item !== night) : [...person.nights, night],
                        })
                      }
                    />
                    {night}
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={person.roomShare}
              onChange={(event) => onChange({ roomShare: event.target.checked })}
            />
            I'm willing to share a room
          </label>
          <Field label="Roommate's name (optional)">
            <Input
              value={person.roommate}
              maxLength={120}
              onChange={(event) => onChange({ roommate: event.target.value })}
            />
          </Field>
        </div>
      ) : null}

      <div className="space-y-3">
        <SectionHeading>Getting there</SectionHeading>
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-5"
            checked={person.parking}
            onChange={(event) => onChange({ parking: event.target.checked })}
          />
          I'll need parking
        </label>
      </div>

      <div className="space-y-3">
        <SectionHeading>Accessibility</SectionHeading>
        <Field label="Accessibility needs">
          <Textarea
            value={person.accessibility}
            maxLength={500}
            onChange={(event) => onChange({ accessibility: event.target.value })}
          />
        </Field>
      </div>

      {person.under18 ? null : (
        <div className="space-y-3">
          <SectionHeading>Emergency contact</SectionHeading>
          <p className="text-sm text-ink-soft">Optional.</p>
          <Field label="Name">
            <Input value={person.emergencyName} onChange={(event) => onChange({ emergencyName: event.target.value })} />
          </Field>
          <Field label="Phone">
            <Input
              value={person.emergencyPhone}
              autoComplete="tel"
              onChange={(event) => onChange({ emergencyPhone: event.target.value })}
            />
          </Field>
        </div>
      )}
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
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
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
      const admission = page.tickets.find((ticket) => ticket.id === person.admissionId);
      const detailMessage = detailsErrors(
        { lodging: person.lodging, refundAcknowledged: person.refundAcknowledged },
        {
          housingAsked: Boolean(page.housing_info?.trim()),
          refundPolicyShown: Boolean(page.refund_policy?.trim()),
          paid: Boolean(admission && admission.price_cents > 0),
          affiliationPrompt: admission?.affiliation_prompt,
          affiliation: person.badgeAffiliation,
        },
      )[0];
      if (detailMessage) {
        setError(detailMessage);
        return;
      }
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
            ...(!person.under18 && person.emergencyName.trim() ? { emergencyName: person.emergencyName.trim() } : {}),
            ...(!person.under18 && person.emergencyPhone.trim() ? { emergencyPhone: person.emergencyPhone.trim() } : {}),
            details: {
              title: person.title,
              badgeName: person.badgeName.trim(),
              position: person.position.trim(),
              city: person.city.trim(),
              state: person.state.trim(),
              dietaryTags: person.dietaryTags,
              ...(person.lodging ? { lodging: person.lodging } : {}),
              nights: person.nights,
              roomShare: person.roomShare,
              roommate: person.roommate.trim(),
              parking: person.parking,
              notes: person.notes.trim(),
              refundAcknowledged: person.refundAcknowledged,
            },
          })),
          acceptedAgreementIds: page.agreements.filter((item) => accepted[item.id]).map((item) => item.id),
          ...(attendees.some((person) => person.under18) && page.guardianConsent
            ? { consentTextId: page.guardianConsent.id }
            : {}),
          newsOptIn,
          ...(heardFrom.trim() ? { heardFrom: heardFrom.trim() } : {}),
          ...(utmSource ? { utmSource } : {}),
          website,
          ...(turnstileToken ? { turnstileToken } : {}),
        },
      });
      setConfirmation({
        code: result.code,
        manageUrl: result.manageUrl,
        status: result.status,
        totalCents: result.totalCents,
        ...(result.payUrl ? { payUrl: result.payUrl } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration could not be completed. Please try again.");
      setBusy(false);
    }
  }

  const admissions = page.tickets.filter((ticket) => ticket.kind === "admission");
  const addOns = page.tickets.filter((ticket) => ticket.kind === "add_on");
  const paying = attendees.some((person) => {
    const ticket = admissions.find((item) => item.id === person.admissionId);
    return Boolean(ticket && ticket.price_cents > 0 && ticket.hasPaymentLink);
  });

  if (confirmation) {
    const manageHref =
      confirmation.manageUrl.startsWith("http") || typeof window === "undefined"
        ? confirmation.manageUrl
        : `${window.location.origin}${confirmation.manageUrl}`;
    return (
      <div className="min-h-dvh bg-paper text-ink">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <a href="/site" className="font-display text-base leading-tight sm:text-lg">
              {page.public_title || "Society of Catholic Scientists"}
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
          <h1 className="font-display text-4xl">
            {confirmation.status === "pending" ? "Awaiting payment" : "You're registered."}
          </h1>
          <p className="font-display text-5xl tracking-wide">{confirmation.code}</p>
          <p>
            <a href={manageHref} className="break-all text-bronze underline-offset-2 hover:underline">
              {manageHref}
            </a>
          </p>
          <p>Keep this link: it is how you see your registration later.</p>
          {confirmation.status === "pending" && confirmation.payUrl ? (
            <>
              <a
                href={confirmation.payUrl}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-bronze px-4 text-sm font-medium text-bronze-fg"
              >
                Pay {formatCents(confirmation.totalCents)} now
              </a>
              <p>Your place is held, but registration is complete only when payment is received.</p>
            </>
          ) : null}
        </main>
      </div>
    );
  }

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
              <PersonFields
                person={person}
                admissions={admissions}
                addOns={addOns}
                tickets={page.tickets}
                guardianOpen={guardianOpen}
                guardianHtml={page.guardianConsent?.html ?? null}
                housingInfo={page.housing_info}
                nights={nightOptions(page.housing_nights)}
                onChange={(patch) => updateAttendee(person.key, patch)}
              />
            </section>
          ))}

          {paying && attendees.length > 1 ? (
            <p className="text-sm text-ink-soft">
              Paid tickets are for one person at a time. For a group, please contact the chapter.
            </p>
          ) : null}
          {paying ? <p>You will pay on the next step with Stripe.</p> : null}
          {!paying && attendees.length < MAX_ATTENDEES ? (
            <Button type="button" variant="secondary" onClick={() => setAttendees((list) => [...list, emptyAttendee(crypto.randomUUID())])}>
              Add a person
            </Button>
          ) : null}

          {page.agreements.length ? <h2 className="font-display text-2xl">Agreements</h2> : null}
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

          {attendees.map((person) => {
            const admission = admissions.find((ticket) => ticket.id === person.admissionId);
            if (!page.refund_policy?.trim() || !admission || admission.price_cents <= 0) return null;
            return (
              <section key={`refund-${person.key}`} className="space-y-3">
                {attendees.length > 1 ? (
                  <h2 className="font-display text-2xl">
                    {person.givenName.trim() || "Person"} {person.familyName.trim()}
                  </h2>
                ) : null}
                <PublicCopy text={page.refund_policy} className="text-sm text-ink-soft" />
                <label className="flex min-h-11 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-5"
                    required
                    checked={person.refundAcknowledged}
                    onChange={(event) => updateAttendee(person.key, { refundAcknowledged: event.target.checked })}
                  />
                  I have read the refund policy
                </label>
              </section>
            );
          })}

          {attendees.map((person) => (
            <div key={`notes-${person.key}`} className="space-y-3">
              {attendees.length > 1 ? (
                <h2 className="font-display text-2xl">
                  {person.givenName.trim() || "Person"} {person.familyName.trim()}
                </h2>
              ) : null}
              <Field label="Anything else we should know?">
                <Textarea
                  value={person.notes}
                  maxLength={500}
                  onChange={(event) => updateAttendee(person.key, { notes: event.target.value })}
                />
              </Field>
            </div>
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
