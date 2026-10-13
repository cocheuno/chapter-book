import { createFileRoute } from "@tanstack/react-router";
import { PublicCopy } from "@/components/public-copy";
import { getManagePage } from "@/lib/crm/registration-public";

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
            <li key={person.id}>
              <p>{person.name}</p>
              {person.tickets.length ? <p className="text-sm text-ink-soft">{person.tickets.join(", ")}</p> : null}
            </li>
          ))}
        </ul>
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
