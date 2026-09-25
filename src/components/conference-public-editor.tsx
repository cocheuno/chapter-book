import { fileToBase64, PictureField } from "@/components/picture-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  addConferenceSession,
  getConferenceDesk,
  removeConferenceSession,
  saveConferencePage,
  saveConferenceSession,
} from "@/lib/crm/conference-public";
import { uploadSiteImage } from "@/lib/crm/site";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Desk = Awaited<ReturnType<typeof getConferenceDesk>>;

export function ConferencePublicEditor({ eventId }: { eventId: string }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [title, setTitle] = useState("");

  function load() {
    getConferenceDesk({ data: eventId })
      .then(setDesk)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not open the public page"));
  }
  useEffect(() => {
    load();
  }, [eventId]);

  if (!desk) return <p className="text-muted">Opening the public page…</p>;
  const page = desk.page;

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Public page</h2>
          <p className="mt-1 text-sm text-ink-soft">
            What you save here is what visitors see. Type each speaker. People in the book stay off the page.
          </p>
        </div>
        {page.slug ? (
          <a href={`/p/${page.slug}`} className="text-sm text-bronze underline-offset-2 hover:underline">
            Open the public page
          </a>
        ) : null}
      </div>

      <PageForm
        eventId={eventId}
        page={page}
        onSaved={() => {
          toast.success("Public page saved");
          load();
        }}
      />

      <div className="border-t border-line pt-4">
        <h3 className="font-display text-lg">Sessions</h3>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (ev) => {
            ev.preventDefault();
            try {
              await addConferenceSession({ data: { eventId, title } });
              setTitle("");
              load();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not add the session");
            }
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Session title" required />
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
              onSaved={() => {
                toast.success("Session saved");
                load();
              }}
              onRemoved={() => load()}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function PageForm({
  eventId,
  page,
  onSaved,
}: {
  eventId: string;
  page: Desk["page"];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [headline, setHeadline] = useState(page.subtitle ?? "");
  const [summary, setSummary] = useState(page.summary ?? "");
  const [whenLabel, setWhenLabel] = useState(page.when_label ?? "");
  const [location, setLocation] = useState(page.location ?? "");
  const [registerUrl, setRegisterUrl] = useState(page.url ?? "");
  const [body, setBody] = useState(page.body ?? "");
  const [imageId, setImageId] = useState(page.image_id ?? "");
  const [file, setFile] = useState<File | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (ev) => {
        ev.preventDefault();
        try {
          let nextImage = imageId;
          if (file) {
            if (file.size > 1_500_000) throw new Error("That picture is larger than 1.5 MB.");
            const uploaded = await uploadSiteImage({ data: { data: await fileToBase64(file) } });
            nextImage = uploaded.id;
          }
          await saveConferencePage({
            data: { eventId, title, headline, summary, whenLabel, location, registerUrl, body, imageId: nextImage },
          });
          setImageId(nextImage);
          setFile(null);
          onSaved();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not save the public page");
        }
      }}
    >
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field label="Headline">
        <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </Field>
      <Field label="When">
        <Input value={whenLabel} onChange={(e) => setWhenLabel(e.target.value)} placeholder="April 16, 2027" />
      </Field>
      <Field label="Where">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Summary">
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
      </div>
      <Field label="Register link">
        <Input value={registerUrl} onChange={(e) => setRegisterUrl(e.target.value)} placeholder="https://" />
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
      <div className="sm:col-span-2">
        <Field label="Longer introduction">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-32" />
        </Field>
      </div>
      <Button type="submit">Save public page</Button>
    </form>
  );
}

function SessionCard({
  eventId,
  session,
  onSaved,
  onRemoved,
}: {
  eventId: string;
  session: Desk["sessions"][number];
  onSaved: () => void;
  onRemoved: () => void;
}) {
  const [title, setTitle] = useState(session.title);
  const [whenLabel, setWhenLabel] = useState(session.when_label ?? "");
  const [track, setTrack] = useState(session.track ?? "");
  const [room, setRoom] = useState(session.room ?? "");
  const [speaker, setSpeaker] = useState(session.public_speaker ?? "");
  const [summary, setSummary] = useState(session.summary ?? "");
  const [body, setBody] = useState(session.body ?? "");
  const [articleUrl, setArticleUrl] = useState(session.article_url ?? "");
  const [imageId, setImageId] = useState(session.image_id ?? "");
  const [featured, setFeatured] = useState(Boolean(session.featured));
  const [file, setFile] = useState<File | null>(null);

  return (
    <li className="rounded-lg border border-line p-3">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (ev) => {
            ev.preventDefault();
            try {
              let nextImage = imageId;
              if (file) {
                if (file.size > 1_500_000) throw new Error("That picture is larger than 1.5 MB.");
                const uploaded = await uploadSiteImage({ data: { data: await fileToBase64(file) } });
                nextImage = uploaded.id;
              }
              await saveConferenceSession({
                data: {
                  eventId,
                  sessionId: session.id,
                  title,
                  room,
                  whenLabel,
                  track,
                  speaker,
                  summary,
                  body,
                  articleUrl,
                  imageId: nextImage,
                  featured,
                },
              });
              setImageId(nextImage);
              setFile(null);
              onSaved();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not save the session");
            }
          }}
        >
          <Field label="Session title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Speaker">
            <Input value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="Name, role, institution" />
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
          <div className="sm:col-span-2">
            <Field label="Biography">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-32" />
            </Field>
          </div>
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
                  onRemoved();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not remove the session");
                }
              }}
            >
              Remove session
            </Button>
          </div>
        </form>
    </li>
  );
}
