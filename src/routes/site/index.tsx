import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { PublicText } from "@/components/public-copy";
import { publicCopyHtml } from "@/lib/crm/announcement-html";
import { parseHomeSections, type HomeSectionKey } from "@/lib/crm/homepage-rules";
import { siteHead } from "@/lib/crm/page-head";
import { getPublicOrigin } from "@/lib/crm/public-origin";
import { getPublicSite } from "@/lib/crm/site";
import type { SiteItemRow } from "@/lib/crm/site";
import { siteImageSrc } from "@/lib/crm/site-image";

export const Route = createFileRoute("/site/")({
  loader: async () => {
    const [data, origin] = await Promise.all([getPublicSite(), getPublicOrigin()]);
    return { data, origin };
  },
  head: ({ loaderData }) =>
    loaderData ? siteHead(loaderData.data.settings, loaderData.origin) : {},
  errorComponent: PublicSiteUnavailable,
  component: PublicSite,
});

function PublicSiteUnavailable() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <p className="text-danger">This page is not available right now. Please try again shortly.</p>
    </main>
  );
}

function hrefFor(url: string | null | undefined) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function pageHref(item: SiteItemRow) {
  if (item.detailsHref) return item.detailsHref;
  if (item.slug) return `/p/${item.slug}`;
  return hrefFor(item.url);
}

function PublicSite() {
  const { data } = Route.useLoaderData();
  const top = data.top ?? null;

  const grouped = useMemo(() => {
    const items = (data?.items ?? []).filter((item) => item.id !== top?.id);
    return {
      announcements: items.filter((i) => i.kind === "announcement"),
      events: items.filter((i) => i.kind === "event"),
      articles: items.filter((i) => i.kind === "article"),
      documents: items.filter((i) => i.kind === "document"),
      courses: items.filter((i) => i.kind === "course"),
    };
  }, [data, top]);

  const { settings } = data;

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-1 size-6 shrink-0 text-bronze" />
            <div>
              <p className="font-display text-xl leading-tight">{settings.public_title}</p>
              {settings.public_tagline ? (
                <p className="mt-1 text-sm text-ink-soft">{settings.public_tagline}</p>
              ) : null}
            </div>
          </div>
          <Link to="/login" className="text-sm text-bronze underline-offset-2 hover:underline">
            Chapter leadership
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-14 px-4 py-10">
        {top ? <TopCard item={top} /> : null}
        {settings.about ? (
          <section>
            <h1 className="font-display text-3xl">The chapter</h1>
            <PublicText
              text={settings.about}
              className="mt-3 text-lg leading-relaxed text-ink-soft"
            />
          </section>
        ) : null}

        {parseHomeSections(data.homeSections).map((kind) => (
          <ShelfSection key={kind} kind={kind} grouped={grouped} />
        ))}

        {data.pastEvents?.length ? (
          <Section title="Past events" empty="">
            {data.pastEvents.map((e) => (
              <EventCard key={e.id} item={e} />
            ))}
          </Section>
        ) : null}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
          <p>{settings.contact_email ?? "Society of Catholic Scientists"}</p>
          <Link to="/login" className="text-bronze underline-offset-2 hover:underline">
            Sign in to Chapter Book
          </Link>
        </div>
      </footer>
    </div>
  );
}

type ShelfGroups = {
  announcements: SiteItemRow[];
  events: SiteItemRow[];
  articles: SiteItemRow[];
  documents: SiteItemRow[];
  courses: SiteItemRow[];
};

function ShelfSection({ kind, grouped }: { kind: HomeSectionKey; grouped: ShelfGroups }) {
  if (kind === "event") {
    return (
      <Section title="Upcoming Events" empty="No public gatherings posted yet.">
        {grouped.events.map((e) => (
          <EventCard key={e.id} item={e} />
        ))}
      </Section>
    );
  }
  if (kind === "announcement") {
    return (
      <Section title="Announcements" empty="No announcements posted yet.">
        {grouped.announcements.map((e) => (
          <EventCard key={e.id} item={e} />
        ))}
      </Section>
    );
  }
  if (kind === "article") {
    return (
      <Section title="Articles" empty="No articles posted yet.">
        {grouped.articles.map((a) => (
          <CopyCard key={a.id} item={a} linkLabel="Read the article" />
        ))}
      </Section>
    );
  }
  if (kind === "document") {
    return (
      <Section title="Documents" empty="No documents posted yet.">
        {grouped.documents.map((d) => (
          <CopyCard key={d.id} item={d} linkLabel="Open document" />
        ))}
      </Section>
    );
  }
  return (
    <Section title="Upcoming courses" empty="No courses posted yet.">
      {grouped.courses.map((c) => (
        <li key={c.id} className="rounded-xl border border-line bg-surface p-5">
          <h3 className="font-display text-xl">{c.title}</h3>
          <p className="mt-1 text-sm text-muted">{[c.audience, c.subtitle].filter(Boolean).join(" · ")}</p>
          <PublicText text={c.summary} className="mt-2 leading-relaxed text-ink-soft" />
        </li>
      ))}
    </Section>
  );
}

function TopCard({ item }: { item: SiteItemRow }) {
  const url = pageHref(item);
  const register = hrefFor(item.url);
  const rich = publicCopyHtml(item.summary) ?? (item.summary?.trim() ? null : publicCopyHtml(item.body));
  const picture = siteImageSrc(item.image_id);
  return (
    <article className="rounded-xl border border-line bg-surface p-8">
      {picture ? <img src={picture} alt={item.title} className="mb-5 w-full rounded-lg" /> : null}
      <p className="text-xs tracking-wide text-bronze uppercase">
        {item.layout === "conference" ? "Conference" : item.featured ? "Featured" : "Gathering"}
      </p>
      <h2 className="mt-1 font-display text-3xl">{item.title}</h2>
      {item.when_label ? <p className="mt-1 text-sm text-muted">{item.when_label}</p> : null}
      {item.location ? <p className="text-sm text-ink-soft">{item.location}</p> : null}
      {rich ? (
        <div
          className="announcement-html mt-3 leading-relaxed text-ink-soft"
          dangerouslySetInnerHTML={{ __html: rich }}
        />
      ) : item.summary ? (
        <p className="mt-3 leading-relaxed text-ink-soft">{item.summary}</p>
      ) : null}
      {item.eventPage && item.eventPage.href !== url ? (
        <a href={item.eventPage.href} className="mt-3 block text-sm text-bronze underline-offset-2 hover:underline">
          Event page: {item.eventPage.title}
        </a>
      ) : null}
      {url ? (
        <a
          href={url}
          className="mt-3 inline-block text-sm text-bronze underline-offset-2 hover:underline"
          {...(url.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" })}
        >
          {item.slug ? (item.layout === "conference" ? "Conference page" : "Event details") : "Register"}
        </a>
      ) : null}
      {register && register !== url ? (
        <a
          href={register}
          className="mt-3 ml-4 inline-block text-sm text-bronze underline-offset-2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Register
        </a>
      ) : null}
    </article>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const list = Array.isArray(children) ? children : [children];
  const items = list.filter(Boolean);
  return (
    <section>
      <h2 className="font-display text-2xl">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-muted">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-4">{children}</ul>
      )}
    </section>
  );
}

function EventCard({ item }: { item: SiteItemRow }) {
  const url = pageHref(item);
  const rich =
    publicCopyHtml(item.summary) ?? (item.summary?.trim() ? null : publicCopyHtml(item.body));
  return (
    <li className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs tracking-wide text-bronze uppercase">
        {item.layout === "conference" ? "Conference" : item.featured ? "Featured" : "Gathering"}
      </p>
      <h3 className="mt-1 font-display text-xl">{item.title}</h3>
      {item.when_label ? <p className="mt-1 text-sm text-muted">{item.when_label}</p> : null}
      {item.location ? <p className="text-sm text-ink-soft">{item.location}</p> : null}
      {rich ? (
        <div
          className="announcement-html mt-3 leading-relaxed text-ink-soft"
          dangerouslySetInnerHTML={{ __html: rich }}
        />
      ) : item.summary ? (
        <p className="mt-3 leading-relaxed text-ink-soft">{item.summary}</p>
      ) : null}
      {item.eventPage && item.eventPage.href !== url ? (
        <a
          href={item.eventPage.href}
          className="mt-3 block text-sm text-bronze underline-offset-2 hover:underline"
        >
          Event page: {item.eventPage.title}
        </a>
      ) : null}
      {url ? (
        <a
          href={url}
          className="mt-3 inline-block text-sm text-bronze underline-offset-2 hover:underline"
          {...(url.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" })}
        >
          {item.slug
            ? item.layout === "conference"
              ? "Conference page"
              : "Event details"
            : "Register"}
        </a>
      ) : null}
    </li>
  );
}

function CopyCard({ item, linkLabel }: { item: SiteItemRow; linkLabel: string }) {
  const url = pageHref(item);
  return (
    <li className="border-b border-line pb-5 last:border-0">
      <h3 className="font-display text-xl">{item.title}</h3>
      {item.subtitle ? <p className="mt-1 text-sm text-muted">{item.subtitle}</p> : null}
      <PublicText text={item.summary} className="mt-2 leading-relaxed text-ink-soft" />
      {url ? (
        <a
          href={url}
          className="mt-2 inline-block text-sm text-bronze underline-offset-2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          {linkLabel}
        </a>
      ) : null}
    </li>
  );
}
