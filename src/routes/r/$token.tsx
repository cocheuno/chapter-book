import { createFileRoute } from "@tanstack/react-router";
import { PublicCopy } from "@/components/public-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { mintConsentLink } from "@/lib/crm/consent";
import { getManagePage } from "@/lib/crm/registration-public";
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
  return (
    <main className="min-h-dvh bg-paper px-4 py-10 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        {page.public_title ? <p className="font-display text-xl">{page.public_title}</p> : null}
        <h1 className="font-display text-4xl">{cancelled ? "This registration was cancelled." : "You're registered."}</h1>
        <p className="font-display text-5xl tracking-wide">{page.code}</p>
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
