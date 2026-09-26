import { fileToBase64, PictureField } from "@/components/picture-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { lineupFromSpeakers } from "@/lib/crm/conference-page";
import {
  addConferenceSession,
  addConferenceSpeaker,
  getConferenceDesk,
  removeConferenceSession,
  removeConferenceSpeaker,
  saveConferenceCopy,
  saveConferenceSession,
  saveConferenceSpeaker,
  saveConferenceVenue,
} from "@/lib/crm/conference-public";
import { uploadSiteImage } from "@/lib/crm/site";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Desk = Awaited<ReturnType<typeof getConferenceDesk>>;

export function ConferencePublicEditor({ eventId }: { eventId: string }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [speakerName, setSpeakerName] = useState("");

  function load() {
    getConferenceDesk({ data: eventId })
      .then(setDesk)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not open the conference"));
  }
  useEffect(() => {
    load();
  }, [eventId]);

  if (!desk) return <p className="text-muted">Opening the conference…</p>;
  const page = desk.page;
  const lineup = lineupFromSpeakers(
    desk.speakers.map((speaker) => ({
      name: speaker.name,
      role: speaker.role,
      body: speaker.body,
      imageId: speaker.image_id,
      talkIds: [],
    })),
    [],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Web page</h2>
            <p className="mt-1 text-sm text-ink-soft">The title, introduction, and register link visitors see.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/website" search={{ item: page.id, announce: "" }} className="text-bronze underline-offset-2 hover:underline">
              Edit on Website
            </Link>
            {page.slug ? (
              <a href={`/p/${page.slug}`} className="text-bronze underline-offset-2 hover:underline">
                Open the public page
              </a>
            ) : null}
          </div>
        </div>
        <CopyForm
          eventId={eventId}
          page={page}
          onSaved={() => {
            toast.success("Web page saved");
            load();
          }}
        />
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-display text-xl">Venue</h2>
        <p className="mt-1 text-sm text-ink-soft">When and where the conference meets, and the venue picture.</p>
        <VenueForm
          eventId={eventId}
          page={page}
          onSaved={() => {
            toast.success("Venue saved");
            load();
          }}
        />
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-display text-xl">Speakers</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Each speaker is stored on their own. Adding or saving one does not change the others. People in the book stay
          off the public page.
        </p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (ev) => {
            ev.preventDefault();
            try {
              await addConferenceSpeaker({ data: { eventId, name: speakerName } });
              setSpeakerName("");
              load();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not add the speaker");
            }
          }}
        >
          <Input value={speakerName} onChange={(e) => setSpeakerName(e.target.value)} placeholder="Speaker name" required />
          <Button type="submit" variant="secondary">
            Add speaker
          </Button>
        </form>
        <ul className="mt-4 space-y-3">
          {desk.speakers.map((speaker, index) => (
            <SpeakerCard
              key={speaker.id}
              eventId={eventId}
              speaker={speaker}
              bioHref={page.slug && lineup[index] ? `/p/${page.slug}/speakers/${lineup[index].slug}` : null}
              onChanged={() => load()}
            />
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-display text-xl">Sessions</h2>
        <p className="mt-1 text-sm text-ink-soft">The program. Choose a speaker from the list above for each session.</p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (ev) => {
            ev.preventDefault();
            try {
              await addConferenceSession({ data: { eventId, title: sessionTitle } });
              setSessionTitle("");
              load();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not add the session");
            }
          }}
        >
          <Input value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} placeholder="Session title" required />
          <Button type="submit" variant="secondary">
            Add session
          </Button>
        </form>
        <ul className="mt-4 space-y-3">
          {desk.sessions.map((session) => (
            <SessionCard
              key={session.id}
              eventId={eventId}
              session={session}
              speakers={desk.speakers}
              onChanged={() => load()}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function CopyForm({ eventId, page, onSaved }: { eventId: string; page: Desk["page"]; onSaved: () => void }) {
  const [title, setTitle] = useState(page.title);
  const [headline, setHeadline] = useState(page.subtitle ?? "");
  const [summary, setSummary] = useState(page.summary ?? "");
  const [registerUrl, setRegisterUrl] = useState(page.url ?? "");
  const [body, setBody] = useState(page.body ?? "");
  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={async (ev) => {
        ev.preventDefault();
        try {
          await saveConferenceCopy({ data: { eventId, title, headline, summary, registerUrl, body } });
          onSaved();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not save the web page");
        }
      }}
    >
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field label="Headline">
        <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Summary">
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
      </div>
      <Field label="Register link">
        <Input value={registerUrl} onChange={(e) => setRegisterUrl(e.target.value)} placeholder="https://" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Introduction">
          <p className="text-sm text-ink-soft">Press Enter to start a new paragraph.</p>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-32" />
        </Field>
      </div>
      <Button type="submit">Save web page</Button>
    </form>
  );
}

function VenueForm({ eventId, page, onSaved }: { eventId: string; page: Desk["page"]; onSaved: () => void }) {
  const [whenLabel, setWhenLabel] = useState(page.when_label ?? "");
  const [location, setLocation] = useState(page.location ?? "");
  const [imageId, setImageId] = useState(page.image_id ?? "");
  const [file, setFile] = useState<File | null>(null);
  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={async (ev) => {
        ev.preventDefault();
        try {
          let nextImage = imageId;
          if (file) {
            if (file.size > 1_500_000) throw new Error("That picture is larger than 1.5 MB.");
            const uploaded = await uploadSiteImage({ data: { data: await fileToBase64(file) } });
            nextImage = uploaded.id;
          }
          await saveConferenceVenue({ data: { eventId, whenLabel, location, imageId: nextImage } });
          setImageId(nextImage);
          setFile(null);
          onSaved();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not save the venue");
        }
      }}
    >
      <Field label="When">
        <Input value={whenLabel} onChange={(e) => setWhenLabel(e.target.value)} placeholder="April 16, 2027" />
      </Field>
      <Field label="Where">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="University, city" />
      </Field>
      <PictureField
        label="Venue photo"
        imageId={imageId}
        file={file}
        onFile={setFile}
        onClear={() => {
          setFile(null);
          setImageId("");
        }}
      />
      <div className="flex items-end">
        <Button type="submit">Save venue</Button>
      </div>
    </form>
  );
}

function SpeakerCard({
  eventId,
  speaker,
  bioHref,
  onChanged,
}: {
  eventId: string;
  speaker: Desk["speakers"][number];
  bioHref: string | null;
  onChanged: () => void;
}) {
  const [name, setName] = useState(speaker.name);
  const [role, setRole] = useState(speaker.role ?? "");
  const [body, setBody] = useState(speaker.body ?? "");
  const [imageId, setImageId] = useState(speaker.image_id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{speaker.name}</p>
          {speaker.role ? <p className="text-sm text-ink-soft">{speaker.role}</p> : null}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {bioHref ? (
            <a href={bioHref} target="_blank" rel="noreferrer" className="min-h-11 text-bronze underline-offset-2 hover:underline">
              View biography
            </a>
          ) : null}
          <button type="button" className="min-h-11 text-bronze" onClick={() => setOpen((value) => !value)}>
            {open ? "Close" : "Edit"}
          </button>
        </div>
      </div>
      {open ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={async (ev) => {
            ev.preventDefault();
            try {
              let nextImage = imageId;
              if (file) {
                if (file.size > 1_500_000) throw new Error("That picture is larger than 1.5 MB.");
                const uploaded = await uploadSiteImage({ data: { data: await fileToBase64(file) } });
                nextImage = uploaded.id;
              }
              await saveConferenceSpeaker({
                data: { eventId, speakerId: speaker.id, name, role, body, imageId: nextImage },
              });
              setImageId(nextImage);
              setFile(null);
              toast.success("Speaker saved");
              onChanged();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not save the speaker");
            }
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Role">
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Professor of physics" />
          </Field>
          <PictureField
            label="Headshot"
            imageId={imageId}
            file={file}
            onFile={setFile}
            onClear={() => {
              setFile(null);
              setImageId("");
            }}
          />
          <div className="sm:col-span-2">
            <Field label="Biography">
              <p className="text-sm text-ink-soft">Press Enter to start a new paragraph.</p>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-40" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit">Save speaker</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                try {
                  await removeConferenceSpeaker({ data: { eventId, speakerId: speaker.id } });
                  onChanged();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not remove the speaker");
                }
              }}
            >
              Remove speaker
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function SessionCard({
  eventId,
  session,
  speakers,
  onChanged,
}: {
  eventId: string;
  session: Desk["sessions"][number];
  speakers: Desk["speakers"];
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(session.title);
  const [whenLabel, setWhenLabel] = useState(session.when_label ?? "");
  const [track, setTrack] = useState(session.track ?? "");
  const [room, setRoom] = useState(session.room ?? "");
  const [summary, setSummary] = useState(session.summary ?? "");
  const [articleUrl, setArticleUrl] = useState(session.article_url ?? "");
  const [speakerId, setSpeakerId] = useState(session.speaker_id ?? "");
  const [featured, setFeatured] = useState(Boolean(session.featured));
  const [open, setOpen] = useState(false);
  const speakerName = speakers.find((speaker) => speaker.id === speakerId)?.name;
  return (
    <li className="rounded-lg border border-line p-3">
      <button type="button" className="min-h-11 w-full text-left" onClick={() => setOpen((value) => !value)}>
        <span className="font-medium">{session.title}</span>
        {speakerName ? <span className="mt-0.5 block text-sm text-ink-soft">{speakerName}</span> : null}
      </button>
      {open ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={async (ev) => {
            ev.preventDefault();
            try {
              await saveConferenceSession({
                data: {
                  eventId,
                  sessionId: session.id,
                  title,
                  room,
                  whenLabel,
                  track,
                  summary,
                  articleUrl,
                  featured,
                  speakerId,
                },
              });
              toast.success("Session saved");
              onChanged();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not save the session");
            }
          }}
        >
          <Field label="Session title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Speaker">
            <Select value={speakerId} onChange={(e) => setSpeakerId(e.target.value)}>
              <option value="">No speaker yet</option>
              {speakers.map((speaker) => (
                <option key={speaker.id} value={speaker.id}>
                  {speaker.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="When">
            <Input value={whenLabel} onChange={(e) => setWhenLabel(e.target.value)} placeholder="9:30 a.m." />
          </Field>
          <Field label="Track">
            <Input value={track} onChange={(e) => setTrack(e.target.value)} placeholder="How it works" />
          </Field>
          <Field label="Room">
            <Input value={room} onChange={(e) => setRoom(e.target.value)} />
          </Field>
          <Field label="Article link">
            <Input value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="https://" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Short description">
              <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            Keynote
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit">Save session</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                try {
                  await removeConferenceSession({ data: { eventId, sessionId: session.id } });
                  onChanged();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not remove the session");
                }
              }}
            >
              Remove session
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
