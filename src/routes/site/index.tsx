import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { announcementCardHtml } from "@/lib/crm/announcement-html";
import { getPublicSite } from "@/lib/crm/site";
import type { SiteItemRow } from "@/lib/crm/site";

export const Route = createFileRoute("/site/")({ component: PublicSite });

function hrefFor(url: string | null | undefined) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function pageHref(item: SiteItemRow) {
  if (item.slug) return `/p/${item.slug}`;
  return hrefFor(item.url);
}

function PublicSite() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getPublicSite>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getPublicSite()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load the chapter site"));
  }, []);

  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    return {
      announcements: items.filter((i) => i.kind === "announcement"),
      events: items.filter((i) => i.kind === "event"),
      articles: items.filter((i) => i.kind === "article"),
      documents: items.filter((i) => i.kind === "document"),
      courses: items.filter((i) => i.kind === "course"),
    };
  }, [data]);

  if (err) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
        <p className="text-danger">{err}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-muted">Opening the chapter site…</main>
    );
  }

  const { settings } = data;

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-1 size-6 shrink-0 text-bronze" />
            <div>
              <p className="font-display text-xl leading-tight">{settings.public_title}</p>
              {settings.public_tagline ? <p className="mt-1 text-sm text-ink-soft">{settings.public_tagline}</p> : null}
            </div>
          </div>
          <Link to="/login" className="text-sm text-bronze underline-offset-2 hover:underline">
            Chapter leadership
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-14 px-4 py-10">
        {settings.about ? (
          <section>
            <h1 className="font-display text-3xl">The chapter</h1>
            <p className="mt-3 text-lg leading-relaxed text-ink-soft">{settings.about}</p>
          </section>
        ) : null}

        <Section title="Announcements" empty="No announcements posted yet.">
          {grouped.announcements.map((e) => (
            <EventCard key={e.id} item={e} />
          ))}
        </Section>

        <Section title="Gatherings" empty="No public gatherings posted yet.">
          {grouped.events.map((e) => (
            <EventCard key={e.id} item={e} />
          ))}
        </Section>

        <Section title="Articles" empty="No articles posted yet.">
          {grouped.articles.map((a) => (
            <CopyCard key={a.id} item={a} linkLabel="Read the article" />
          ))}
        </Section>

        <Section title="Documents" empty="No documents posted yet.">
          {grouped.documents.map((d) => (
            <CopyCard key={d.id} item={d} linkLabel="Open document" />
          ))}
        </Section>

        <Section title="Upcoming courses" empty="No courses posted yet.">
          {grouped.courses.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-surface p-5">
              <h3 className="font-display text-xl">{c.title}</h3>
              <p className="mt-1 text-sm text-muted">{[c.audience, c.subtitle].filter(Boolean).join(" · ")}</p>
              {c.summary ? <p className="mt-2 leading-relaxed text-ink-soft">{c.summary}</p> : null}
            </li>
          ))}
        </Section>
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

function Section({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
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
  const rich = item.kind === "announcement" ? announcementCardHtml(item.summary, item.body) : null;
  return (
    <li className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs tracking-wide text-bronze uppercase">
        {item.layout === "conference" ? "Conference" : item.featured ? "Featured" : "Gathering"}
      </p>
      <h3 className="mt-1 font-display text-xl">{item.title}</h3>
      {item.when_label ? <p className="mt-1 text-sm text-muted">{item.when_label}</p> : null}
      {item.location ? <p className="text-sm text-ink-soft">{item.location}</p> : null}
      {rich ? (
        <div className="announcement-html mt-3 leading-relaxed text-ink-soft" dangerouslySetInnerHTML={{ __html: rich }} />
      ) : item.summary ? (
        <p className="mt-3 leading-relaxed text-ink-soft">{item.summary}</p>
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
    </li>
  );
}

function CopyCard({ item, linkLabel }: { item: SiteItemRow; linkLabel: string }) {
  const url = pageHref(item);
  return (
    <li className="border-b border-line pb-5 last:border-0">
      <h3 className="font-display text-xl">{item.title}</h3>
      {item.subtitle ? <p className="mt-1 text-sm text-muted">{item.subtitle}</p> : null}
      {item.summary ? <p className="mt-2 leading-relaxed text-ink-soft">{item.summary}</p> : null}
      {url ? (
        <a href={url} className="mt-2 inline-block text-sm text-bronze underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
          {linkLabel}
        </a>
      ) : null}
    </li>
  );
}
