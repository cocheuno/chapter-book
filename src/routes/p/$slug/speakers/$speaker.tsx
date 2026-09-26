import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { biographyParagraphs, buildConferenceProgram, lineupFromSpeakers } from "@/lib/crm/conference-page";
import { getPublicPage } from "@/lib/crm/site";

export const Route = createFileRoute("/p/$slug/speakers/$speaker")({ component: SpeakerBioPage });

function SpeakerBioPage() {
  const { slug, speaker: speakerSlug } = Route.useParams();
  const [view, setView] = useState<"loading" | "missing" | "ready">("loading");
  const [page, setPage] = useState<Awaited<ReturnType<typeof getPublicPage>>>(null);

  useEffect(() => {
    getPublicPage({ data: slug }).then((next) => {
      setPage(next);
      setView(next && next.layout === "conference" ? "ready" : "missing");
    });
  }, [slug]);

  if (view === "loading") {
    return <main className="grid min-h-dvh place-items-center bg-paper text-muted">Opening the page…</main>;
  }
  if (!page || page.layout !== "conference") {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
        <p>That page is not published.</p>
      </main>
    );
  }
  const derived = buildConferenceProgram(page.program);
  const lineup = page.speakerLineup?.length ? lineupFromSpeakers(page.speakerLineup, page.program) : derived.speakers;
  const speaker = lineup.find((row) => row.slug === speakerSlug);
  if (!speaker) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
        <p>That page is not published.</p>
      </main>
    );
  }
  const bio = biographyParagraphs(speaker.bio);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <a href={`/p/${slug}#speakers`} className="text-sm text-bronze underline-offset-2 hover:underline">
            Speakers
          </a>
          <a href={`/p/${slug}`} className="font-display text-lg leading-tight">
            {page.title}
          </a>
        </div>
      </header>
      <main className="mx-auto grid max-w-3xl gap-8 px-4 py-10 sm:grid-cols-[16rem_1fr] sm:py-14">
        <div className="aspect-square overflow-hidden bg-paper-2 sm:aspect-auto sm:h-64">
          {speaker.headshot ? (
            <img src={speaker.headshot} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center font-display text-5xl text-bronze" aria-hidden>
              {speaker.title.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <h1 className="font-display text-4xl leading-tight">{speaker.title}</h1>
          {speaker.line ? <p className="mt-3 text-lg text-ink-soft">{speaker.line}</p> : null}
          {bio.length > 0 ? (
            <div className="mt-6 space-y-4">
              {bio.map((part) => (
                <p key={part.slice(0, 48)} className="text-lg leading-relaxed whitespace-pre-wrap text-ink-soft">
                  {part}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-lg text-ink-soft">The biography will be posted here.</p>
          )}
          {speaker.talks.length > 0 ? (
            <div className="mt-8">
              <h2 className="font-display text-2xl">Sessions</h2>
              <ul className="mt-3 space-y-2">
                {speaker.talks.map((talk) => (
                  <li key={talk.id}>
                    {talk.slug ? (
                      <a href={`/p/${talk.slug}`} className="text-bronze underline-offset-2 hover:underline">
                        {talk.title}
                      </a>
                    ) : (
                      talk.title
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
