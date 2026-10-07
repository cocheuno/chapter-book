import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { ConferencePage } from "@/components/conference-page";
import { PublicCopy } from "@/components/public-copy";
import { pageHead } from "@/lib/crm/page-head";
import { getPublicOrigin } from "@/lib/crm/public-origin";
import { getPreviewPage, getPublicPage } from "@/lib/crm/site";

export const Route = createFileRoute("/p/$slug/")({
  loader: async ({ params, location }) => {
    const preview = new URLSearchParams(location.searchStr).get("preview") === "1";
    const [page, origin] = await Promise.all([
      preview
        ? getPreviewPage({ data: params.slug }).catch(() => getPublicPage({ data: params.slug }))
        : getPublicPage({ data: params.slug }),
      getPublicOrigin(),
    ]);
    if (!page) throw notFound();
    if (page.canonicalSlug && page.canonicalSlug !== params.slug) {
      throw redirect({ to: "/p/$slug", params: { slug: page.canonicalSlug }, statusCode: 301 });
    }
    return { page, origin };
  },
  head: ({ loaderData }) => (loaderData ? pageHead(loaderData.page, loaderData.origin) : {}),
  notFoundComponent: PublicPageMissing,
  errorComponent: PublicPageUnavailable,
  component: PublicPage,
});

function PublicPageMissing() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <p>That page is not published.</p>
    </main>
  );
}

function PublicPageUnavailable() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <p>This page is not available right now. Please try again shortly.</p>
    </main>
  );
}

function PublicPage() {
  const { page } = Route.useLoaderData();

  const previewBanner =
    page.published === false ? (
      <div className="bg-bronze px-4 py-2 text-center text-sm font-medium text-bronze-fg">
        Preview: not published.
      </div>
    ) : null;

  if (page.layout === "conference") {
    return (
      <>
        {previewBanner}
        <ConferencePage
          page={{
            id: page.id,
            kind: page.kind,
            title: page.title,
            subtitle: page.subtitle,
            summary: page.summary,
            url: page.url,
            when_label: page.when_label,
            audience: page.audience,
            featured: page.featured,
            slug: page.slug,
            image_id: page.image_id,
            location: page.location,
            body: page.body,
            public_title: page.public_title,
            contact_email: page.contact_email,
            program: page.program,
            speakerLineup: page.speakerLineup,
          }}
        />
      </>
    );
  }

  const source = (page.body && page.body.trim()) || (page.summary && page.summary.trim()) || "";

  return (
    <>
      {previewBanner}
      <div className="min-h-dvh bg-paper text-ink">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-5">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-1 size-6 shrink-0 text-bronze" />
              <p className="font-display text-xl leading-tight">
                {page.public_title || "Society of Catholic Scientists"}
              </p>
            </div>
            <a
              href="https://scs-wisconsin-usa.org/"
              className="text-sm text-bronze underline-offset-2 hover:underline"
            >
              Chapter home
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
          <p className="text-xs tracking-wide text-bronze uppercase">{page.kind}</p>
          <h1 className="font-display text-4xl">{page.title}</h1>
          {page.subtitle ? <p className="text-lg text-ink-soft">{page.subtitle}</p> : null}
          {page.when_label ? <p className="text-sm text-muted">{page.when_label}</p> : null}
          {page.location ? <p className="text-sm text-ink-soft">{page.location}</p> : null}
          {page.audience ? <p className="text-sm text-muted">{page.audience}</p> : null}
          {page.eventPage ? (
            <a
              href={page.eventPage.href}
              className="block rounded-xl border border-line bg-surface p-5"
            >
              <p className="text-xs tracking-wide text-bronze uppercase">Event page</p>
              <p className="mt-1 font-display text-2xl">{page.eventPage.title}</p>
            </a>
          ) : null}
          <PublicCopy text={source} className="text-lg leading-relaxed text-ink-soft" />
          {page.url ? (
            <p>
              <a
                href={/^https?:\/\//i.test(page.url) ? page.url : `https://${page.url}`}
                className="text-bronze underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Related link
              </a>
            </p>
          ) : null}
          <p>
            <Link to="/site" className="text-sm text-muted underline-offset-2 hover:underline">
              All public pages
            </Link>
          </p>
        </main>
      </div>
    </>
  );
}
