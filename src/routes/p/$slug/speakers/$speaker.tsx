import { createFileRoute, notFound } from "@tanstack/react-router";
import { PublicCopy } from "@/components/public-copy";
import { buildConferenceProgram, lineupFromSpeakers } from "@/lib/crm/conference-page";
import { speakerHead } from "@/lib/crm/page-head";
import { getPublicOrigin } from "@/lib/crm/public-origin";
import { getPublicPage } from "@/lib/crm/site";

export const Route = createFileRoute("/p/$slug/speakers/$speaker")({
  loader: async ({ params }) => {
    const [page, origin] = await Promise.all([
      getPublicPage({ data: params.slug }),
      getPublicOrigin(),
    ]);
    if (!page || page.layout !== "conference") throw notFound();
    const derived = buildConferenceProgram(page.program);
    const lineup = page.speakerLineup?.length
      ? lineupFromSpeakers(page.speakerLineup, page.program)
      : derived.speakers;
    const speaker = lineup.find((row) => row.slug === params.speaker);
    if (!speaker) throw notFound();
    return { page, speaker, origin };
  },
  head: ({ loaderData }) =>
    loaderData ? speakerHead(loaderData.speaker, loaderData.page, loaderData.origin) : {},
  notFoundComponent: SpeakerMissing,
  errorComponent: SpeakerUnavailable,
  component: SpeakerBioPage,
});

function SpeakerMissing() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <p>That page is not published.</p>
    </main>
  );
}

function SpeakerUnavailable() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <p>This page is not available right now. Please try again shortly.</p>
    </main>
  );
}

function SpeakerBioPage() {
  const { slug } = Route.useParams();
  const { page, speaker } = Route.useLoaderData();
  const bio = speaker.bio;

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <a
            href={`/p/${slug}#speakers`}
            className="text-sm text-bronze underline-offset-2 hover:underline"
          >
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
            <span
              className="grid size-full place-items-center font-display text-5xl text-bronze"
              aria-hidden
            >
              {speaker.title.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <h1 className="font-display text-4xl leading-tight">{speaker.title}</h1>
          {speaker.line ? <p className="mt-3 text-lg text-ink-soft">{speaker.line}</p> : null}
          {bio ? (
            <PublicCopy text={bio} className="mt-6 text-lg leading-relaxed text-ink-soft" />
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
                      <a
                        href={`/p/${talk.slug}`}
                        className="text-bronze underline-offset-2 hover:underline"
                      >
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
