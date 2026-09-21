import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { getPublicPage } from "@/lib/crm/site";

export const Route = createFileRoute("/p/$slug")({ component: PublicPage });

function paragraphs(body: string | null | undefined, fallback: string | null | undefined) {
  const text = (body && body.trim()) || (fallback && fallback.trim()) || "";
  if (!text) return [];
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function PublicPage() {
  const { slug } = Route.useParams();
  const [page, setPage] = useState<Awaited<ReturnType<typeof getPublicPage>> | undefined>(undefined);

  useEffect(() => {
    getPublicPage({ data: slug }).then(setPage);
  }, [slug]);

  if (page === undefined) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper text-muted">Opening the page…</main>
    );
  }
  if (!page) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
        <p>That page is not published.</p>
      </main>
    );
  }

  const blocks = paragraphs(page.body, page.summary);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-1 size-6 shrink-0 text-bronze" />
            <p className="font-display text-xl leading-tight">
              {page.public_title || "Society of Catholic Scientists"}
            </p>
          </div>
          <a href="https://scs-wisconsin-usa.org/" className="text-sm text-bronze underline-offset-2 hover:underline">
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
        {blocks.map((p) => (
          <p key={p.slice(0, 40)} className="text-lg leading-relaxed text-ink-soft whitespace-pre-wrap">
            {p}
          </p>
        ))}
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
  );
}
