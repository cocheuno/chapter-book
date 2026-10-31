import { createFileRoute } from "@tanstack/react-router";
import { PublicCopy } from "@/components/public-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { mintConsentLink } from "@/lib/crm/consent";
import { getManagePage } from "@/lib/crm/registration-public";
import { paymentStateLabel } from "@/lib/payments/payment-link-rules";
import { formatCents } from "@/lib/payments/pricing";
import { useState } from "react";

export const Route = createFileRoute("/r/$token")({
  loader: async ({ params }) => {
    const page = await getManagePage({ data: params.token });
    return { page };
  },
  head: () => ({
    meta: [{ title: "Your registration" }, { name: "robots", content: "noindex" }],
  }),
  component: ManageRegistration,
});

function ManageRegistration() {
  const { page } = Route.useLoaderData();
  const { token } = Route.useParams();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [linkError, setLinkError] = useState<string | null>(null);
  if (!page) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center text-ink">
        <p>We couldn't find that registration. Check the link, or contact the chapter.</p>
      </main>
    );
  }
  const cancelled = page.status === "cancelled";
  const refunded = page.status === "refunded" || page.status === "partly_refunded";
  const pending = page.status === "pending";
  const heading = cancelled
    ? "This registration was cancelled."
    : refunded
      ? "Refunded"
      : pending
        ? "Awaiting payment"
        : "You're registered.";
  return (
    <main className="min-h-dvh bg-paper px-4 py-10 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        {page.public_title ? <p className="font-display text-xl">{page.public_title}</p> : null}
        <p className="text-sm text-muted">{paymentStateLabel(page.status)}</p>
        <h1 className="font-display text-4xl">{heading}</h1>
        <p className="font-display text-5xl tracking-wide">{page.code}</p>
        {page.holdLapsed ? (
          <p>This registration was not paid in time, so its place was released. Contact the chapter if you already paid.</p>
        ) : pending && page.payUrl ? (
          <div className="space-y-3">
            <a
              href={page.payUrl}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-bronze px-4 text-sm font-medium text-bronze-fg"
            >
              Pay {formatCents(page.totalCents)} now
            </a>
            <p>Your place is held, but registration is complete only when payment is received.</p>
          </div>
        ) : null}
        <div className="space-y-1">
          <p className="text-lg">{page.eventTitle}</p>
          {page.when_label ? <p className="text-sm text-muted">{page.when_label}</p> : null}
          {page.location ? <p className="text-sm text-ink-soft">{page.location}</p> : null}
        </div>
        <ul className="space-y-2">
          {page.attendees.map((person) => (
            <li key={person.id} className="space-y-2">
              <p>{person.name}</p>
              {person.tickets.length ? <p className="text-sm text-ink-soft">{person.tickets.join(", ")}</p> : null}
              {person.needsConsent ? (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setLinkError(null);
                      void mintConsentLink({ data: { token, attendeeId: person.id } })
                        .then((result) => {
                          const url = `${window.location.origin}${result.path}`;
                          setLinks((current) => ({ ...current, [person.id]: url }));
                        })
                        .catch((err) => {
                          setLinkError(err instanceof Error ? err.message : "Could not make a consent link.");
                        });
                    }}
                  >
                    Get consent link
                  </Button>
                  {links[person.id] ? (
                    <div className="space-y-1">
                      <Input readOnly value={links[person.id]} aria-label="Consent link" />
                      <p className="text-sm text-ink-soft">Copy this link and forward it to the parent. It works once.</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {linkError ? <p className="text-sm text-danger">{linkError}</p> : null}
        {page.calendarHref ? (
          <p>
            <a href={page.calendarHref} className="text-sm text-bronze underline-offset-2 hover:underline">
              Add to calendar
            </a>
          </p>
        ) : null}
        {page.manage_message ? <PublicCopy text={page.manage_message} className="text-ink-soft" /> : null}
        <p>Bookmark this page. It is your link to this registration.</p>
        <p>Questions: {page.contact_line ?? ""}</p>
      </div>
    </main>
  );
}
