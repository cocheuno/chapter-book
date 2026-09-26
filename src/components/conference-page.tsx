import {
  buildConferenceProgram,
  pieceHref,
  type ConferenceItem,
} from "@/lib/crm/conference-page";
import { siteImageSrc } from "@/lib/crm/site-image";
import { announcementCardHtml } from "@/lib/crm/announcement-html";

export type ConferencePageData = ConferenceItem & {
  location: string | null;
  body: string | null;
  public_title: string | null;
  contact_email: string | null;
  program: ConferenceItem[];
};

function paragraphs(body: string | null | undefined) {
  const text = body?.trim() ?? "";
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function initial(name: string) {
  const ch = name.trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(ch) ? ch : "•";
}

function TextLink({ href, children }: { href: string; children: string }) {
  const external = /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      className="text-sm text-bronze underline-offset-2 hover:underline"
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

function RegisterLink({ href, className }: { href: string; className: string }) {
  const external = /^https?:\/\//i.test(href);
  return (
    <a href={href} className={className} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      Register
    </a>
  );
}

export function ConferencePage({ page }: { page: ConferencePageData }) {
  const program = buildConferenceProgram(page.program);
  const register = pieceHref({ url: page.url });
  const venuePhoto = siteImageSrc(page.image_id);
  const about = paragraphs(page.body);
  const hasProgram = program.keynotes.length + program.tracks.length + program.workshops.length > 0;
  const chapter = page.public_title || "Society of Catholic Scientists";

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <a href="/site" className="font-display text-base leading-tight sm:text-lg">
            {chapter}
          </a>
          {register ? (
            <RegisterLink
              href={register}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-paper"
            />
          ) : null}
        </div>
      </header>

      <section className="bg-ink text-paper">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
          <p className="text-xs tracking-[0.16em] text-paper-2 uppercase">Conference</p>
          <h1 className="mt-3 max-w-4xl font-display text-4xl leading-[1.05] sm:text-5xl">{page.title}</h1>
          {page.subtitle ? (
            <p className="mt-6 max-w-3xl font-display text-2xl leading-snug text-paper-2 sm:text-3xl">{page.subtitle}</p>
          ) : null}
          {page.summary ? <p className="mt-5 max-w-2xl text-lg leading-relaxed text-paper/80">{page.summary}</p> : null}
          <dl className="mt-8 flex max-w-2xl flex-col gap-2 text-sm text-paper/80 sm:flex-row sm:flex-wrap sm:gap-x-8">
            {page.when_label ? (
              <div>
                <dt className="text-xs tracking-wide text-paper-2 uppercase">When</dt>
                <dd className="mt-1">{page.when_label}</dd>
              </div>
            ) : null}
            {page.location ? (
              <div>
                <dt className="text-xs tracking-wide text-paper-2 uppercase">Where</dt>
                <dd className="mt-1">{page.location}</dd>
              </div>
            ) : null}
            {page.audience ? (
              <div>
                <dt className="text-xs tracking-wide text-paper-2 uppercase">Who</dt>
                <dd className="mt-1">{page.audience}</dd>
              </div>
            ) : null}
          </dl>
          {register ? (
            <RegisterLink
              href={register}
              className="mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-paper px-5 text-sm font-medium text-ink sm:w-auto"
            />
          ) : null}
        </div>
      </section>

      {program.notices.length > 0 ? (
        <section className="border-b border-line bg-paper-2">
          <ul className="mx-auto max-w-5xl space-y-3 px-4 py-5">
            {program.notices.map((notice) => {
              const rich = announcementCardHtml(notice.summary, null);
              return (
                <li key={notice.id}>
                  <p className="font-medium">{notice.title}</p>
                  {rich ? (
                    <div
                      className="announcement-html mt-1 text-sm text-ink-soft"
                      dangerouslySetInnerHTML={{ __html: rich }}
                    />
                  ) : notice.summary ? (
                    <p className="mt-1 text-sm text-ink-soft">{notice.summary}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {program.topics.length > 0 ? (
        <nav aria-label="Topics" className="border-b border-line">
          <ul className="mx-auto flex max-w-5xl flex-wrap gap-2 px-4 py-4">
            {program.topics.map((topic) => (
              <li key={topic.name}>
                <a
                  href={`#${topic.anchor}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm"
                >
                  {topic.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <main className="mx-auto max-w-5xl space-y-16 px-4 py-12 sm:py-16">
        <section id="program">
          <h2 className="font-display text-3xl">Program</h2>
          {program.keynotes.length > 0 ? (
            <div id="keynotes" className="mt-8 scroll-mt-20">
              <h3 className="font-display text-2xl">Keynotes</h3>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {program.keynotes.map((talk) => (
                  <TalkCard key={talk.id} talk={talk} kicker="Keynote" />
                ))}
              </ul>
            </div>
          ) : null}
          {program.tracks.map((track) => (
            <div key={track.anchor} id={track.anchor} className="mt-10 scroll-mt-20">
              <h3 className="font-display text-2xl">{track.name}</h3>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {track.talks.map((talk) => (
                  <TalkCard key={talk.id} talk={talk} />
                ))}
              </ul>
            </div>
          ))}
          {!hasProgram ? (
            <p className="mt-4 text-lg text-ink-soft">The program will appear here as talks and workshops are published.</p>
          ) : null}
        </section>

        {program.speakers.length > 0 ? (
          <section id="speakers" className="scroll-mt-20">
            <h2 className="font-display text-3xl">Speakers</h2>
            <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
              {program.speakers.map((speaker) => {
                const href = page.slug ? `/p/${page.slug}/speakers/${speaker.slug}` : null;
                const card = (
                  <>
                    <div className="aspect-square overflow-hidden bg-paper-2">
                      {speaker.headshot ? (
                        <img src={speaker.headshot} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="grid size-full place-items-center font-display text-4xl text-bronze" aria-hidden>
                          {initial(speaker.title)}
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-display text-xl leading-snug">{speaker.title}</h3>
                      {speaker.line ? (
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-soft">{speaker.line}</p>
                      ) : speaker.bio ? (
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-soft">{speaker.bio}</p>
                      ) : null}
                    </div>
                  </>
                );
                return (
                  <li key={speaker.slug}>
                    {href ? (
                      <a
                        href={href}
                        className="block bg-surface shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
                      >
                        {card}
                      </a>
                    ) : (
                      <div className="bg-surface shadow-sm">{card}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {program.workshops.length > 0 ? (
          <section id="workshops" className="scroll-mt-20">
            <h2 className="font-display text-3xl">Workshops</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {program.workshops.map((workshop) => {
                const href = pieceHref(workshop);
                return (
                  <li key={workshop.id} className="rounded-xl border border-line bg-surface p-5">
                    {workshop.audience ? (
                      <p className="text-xs tracking-wide text-bronze uppercase">{workshop.audience}</p>
                    ) : null}
                    <h3 className="mt-1 font-display text-xl">{workshop.title}</h3>
                    {workshop.subtitle ? <p className="mt-1 text-sm text-ink-soft">{workshop.subtitle}</p> : null}
                    {workshop.when_label ? <p className="mt-1 text-sm text-muted">{workshop.when_label}</p> : null}
                    {workshop.summary ? <p className="mt-3 leading-relaxed text-ink-soft">{workshop.summary}</p> : null}
                    {href ? (
                      <p className="mt-3">
                        <TextLink href={href}>{workshop.slug ? "Workshop details" : "Related link"}</TextLink>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {program.notes.length > 0 ? (
          <section id="notes" className="scroll-mt-20">
            <h2 className="font-display text-3xl">Practical notes</h2>
            <ul className="mt-6 divide-y divide-line rounded-xl border border-line bg-surface">
              {program.notes.map((note) => {
                const href = pieceHref(note);
                return (
                  <li key={note.id} className="px-5 py-4">
                    <h3 className="font-display text-xl">{note.title}</h3>
                    {note.subtitle ? <p className="mt-1 text-sm text-muted">{note.subtitle}</p> : null}
                    {note.summary ? <p className="mt-2 text-ink-soft">{note.summary}</p> : null}
                    {href ? (
                      <p className="mt-2">
                        <TextLink href={href}>{note.slug ? "Read the note" : "Open"}</TextLink>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {about.length > 0 ? (
          <section id="about" className="scroll-mt-20">
            <h2 className="font-display text-3xl">The gathering</h2>
            <div className="mt-4 max-w-3xl space-y-4">
              {about.map((part) => (
                <p key={part.slice(0, 48)} className="text-lg leading-relaxed whitespace-pre-wrap text-ink-soft">
                  {part}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {page.when_label || page.location || venuePhoto ? (
          <section id="visit" className="scroll-mt-20 rounded-xl border border-line bg-surface p-5 sm:p-8">
            <h2 className="font-display text-3xl">When and where</h2>
            {venuePhoto ? (
              <img
                src={venuePhoto}
                alt={page.location ? `Venue, ${page.location}` : "Conference venue"}
                className="mt-6 aspect-video w-full rounded-lg object-cover"
              />
            ) : null}
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {page.when_label ? (
                <p>
                  <span className="block text-xs tracking-wide text-bronze uppercase">When</span>
                  <span className="mt-1 block text-lg">{page.when_label}</span>
                </p>
              ) : null}
              {page.location ? (
                <p>
                  <span className="block text-xs tracking-wide text-bronze uppercase">Where</span>
                  <span className="mt-1 block text-lg">{page.location}</span>
                </p>
              ) : null}
            </div>
            {register ? (
              <RegisterLink
                href={register}
                className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper sm:w-auto"
              />
            ) : null}
          </section>
        ) : null}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
          {page.contact_email ? (
            <a className="text-bronze underline-offset-2 hover:underline" href={`mailto:${page.contact_email}`}>
              {page.contact_email}
            </a>
          ) : (
            <p>{chapter}</p>
          )}
          <a href="https://scs-wisconsin-usa.org/" className="text-bronze underline-offset-2 hover:underline">
            Chapter home
          </a>
        </div>
      </footer>
    </div>
  );
}

function TalkCard({ talk, kicker }: { talk: ConferenceItem; kicker?: string }) {
  const href = pieceHref(talk);
  return (
    <li className="flex flex-col rounded-xl border border-line bg-surface p-5">
      <p className="text-xs tracking-wide text-bronze uppercase">{kicker || talk.when_label || "Talk"}</p>
      <h4 className="mt-1 font-display text-xl">{talk.title}</h4>
      {kicker && talk.when_label ? <p className="mt-1 text-sm text-muted">{talk.when_label}</p> : null}
      {talk.subtitle ? <p className="mt-2 text-sm text-ink-soft">{talk.subtitle}</p> : null}
      {talk.summary ? <p className="mt-3 leading-relaxed text-ink-soft">{talk.summary}</p> : null}
      {href ? (
        <p className="mt-3">
          <TextLink href={href}>{talk.slug ? "Read the abstract" : "Related link"}</TextLink>
        </p>
      ) : null}
      {talk.url && /^https?:\/\//i.test(talk.url) ? (
        <p className="mt-2">
          <TextLink href={talk.url}>Article</TextLink>
        </p>
      ) : null}
    </li>
  );
}
