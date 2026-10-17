import { createFileRoute } from "@tanstack/react-router";
import { PublicCopy } from "@/components/public-copy";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { getConsentPage, submitConsent } from "@/lib/crm/consent";
import { guardianConsentErrors } from "@/lib/payments/consent-rules";
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

export const Route = createFileRoute("/c/$token")({
  loader: async ({ params }) => {
    const page = await getConsentPage({ data: params.token });
    return { page };
  },
  head: () => ({
    meta: [{ title: "Guardian consent" }, { name: "robots", content: "noindex" }],
  }),
  component: ConsentPage,
});

function ConsentPage() {
  const { page } = Route.useLoaderData();
  const { token } = Route.useParams();
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [photoRelease, setPhotoRelease] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!page.valid) return;
    const sitekey = page.turnstileSiteKey;
    const el = turnstileRef.current;
    if (!sitekey || !el) return;
    let cancelled = false;
    let widgetId = "";
    const render = () => {
      if (cancelled || !window.turnstile || !turnstileRef.current) return;
      widgetId = window.turnstile.render(turnstileRef.current, {
        sitekey,
        callback: (value: string) => setTurnstileToken(value),
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
  }, [page]);

  if (!page.valid) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center text-ink">
        <p>This consent link is no longer valid.</p>
      </main>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const message = guardianConsentErrors({
      guardianName,
      guardianPhone,
      guardianEmail,
      relationship,
      emergencyName,
      emergencyPhone,
      medicalNotes,
      photoRelease,
      agreed,
      signature,
    })[0];
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    try {
      await submitConsent({
        data: {
          token,
          guardianName: guardianName.trim(),
          guardianPhone: guardianPhone.trim(),
          ...(guardianEmail.trim() ? { guardianEmail: guardianEmail.trim() } : {}),
          relationship: relationship.trim(),
          emergencyName: emergencyName.trim(),
          emergencyPhone: emergencyPhone.trim(),
          ...(medicalNotes.trim() ? { medicalNotes: medicalNotes.trim() } : {}),
          photoRelease,
          agreed,
          signature: signature.trim(),
          ...(turnstileToken ? { turnstileToken } : {}),
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This consent link is no longer valid.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center text-ink">
        <div className="max-w-lg space-y-3">
          <h1 className="font-display text-4xl">Consent received</h1>
          <p>
            Thank you. Consent for {page.studentName} at {page.eventTitle} is on file.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-10 text-ink">
      <form className="mx-auto max-w-3xl space-y-4" onSubmit={onSubmit}>
        <h1 className="font-display text-4xl">{page.eventTitle}</h1>
        <p className="text-lg">Guardian consent for {page.studentName}</p>
        <Field label="Guardian name">
          <Input value={guardianName} autoComplete="name" required onChange={(event) => setGuardianName(event.target.value)} />
        </Field>
        <Field label="Guardian phone">
          <Input value={guardianPhone} autoComplete="tel" required onChange={(event) => setGuardianPhone(event.target.value)} />
        </Field>
        <Field label="Guardian email (optional)">
          <Input type="email" value={guardianEmail} autoComplete="email" onChange={(event) => setGuardianEmail(event.target.value)} />
        </Field>
        <Field label="Relationship to the student">
          <Input value={relationship} required onChange={(event) => setRelationship(event.target.value)} />
        </Field>
        <Field label="Emergency contact name">
          <Input value={emergencyName} required onChange={(event) => setEmergencyName(event.target.value)} />
        </Field>
        <Field label="Emergency contact phone">
          <Input value={emergencyPhone} autoComplete="tel" required onChange={(event) => setEmergencyPhone(event.target.value)} />
        </Field>
        <Field label="Medical notes (optional)">
          <Textarea value={medicalNotes} onChange={(event) => setMedicalNotes(event.target.value)} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-soft">Photo release</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" className="size-5" name="photo" checked={photoRelease} onChange={() => setPhotoRelease(true)} />
            Yes
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" className="size-5" name="photo" checked={!photoRelease} onChange={() => setPhotoRelease(false)} />
            No
          </label>
        </fieldset>
        <div className="max-h-48 overflow-auto rounded-md border border-line bg-surface p-3">
          <PublicCopy text={page.html} className="text-sm text-ink-soft" />
        </div>
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-5"
            required
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          I am this student's parent or legal guardian and I agree
        </label>
        <Field label="Type your full name to sign">
          <Input value={signature} required onChange={(event) => setSignature(event.target.value)} />
        </Field>
        {page.turnstileSiteKey ? <div ref={turnstileRef} /> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          Sign consent
        </Button>
      </form>
    </main>
  );
}
