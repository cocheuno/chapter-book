import { createFileRoute } from "@tanstack/react-router";
import { ConfirmRemove } from "@/components/confirm-remove";
import { Gated } from "@/components/gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyPreview } from "@/components/copy-preview";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { publicCopyHtml } from "@/lib/crm/announcement-html";
import { whenLabelFor } from "@/lib/crm/dates";
import { fileToBase64, PictureField } from "@/components/picture-field";
import { listSite, removeSiteItem, saveSiteItem, saveSiteSettings, uploadSiteImage } from "@/lib/crm/site";
import type { SiteKind } from "@/lib/crm/site-seed";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/website/")({
  validateSearch: (search: Record<string, unknown>) => ({
    item: typeof search.item === "string" ? search.item : "",
    announce: typeof search.announce === "string" ? search.announce : "",
  }),
  component: WebsitePage,
});

type SiteData = Awaited<ReturnType<typeof listSite>>;
type SiteItem = SiteData["items"][number];

const emptyItem = (kind: SiteKind) => ({
  id: "",
  kind,
  title: "",
  subtitle: "",
  summary: "",
  url: "",
  location: "",
  whenLabel: "",
  audience: "",
  featured: false,
  published: false,
  onShelf: false,
  slug: "",
  body: "",
  layout: "page" as "page" | "conference",
  conferenceId: "",
  imageId: "",
  gatheringId: "",
  startsOn: "",
  endsOn: "",
});

function WebsitePage() {
  return (
    <Gated>
      <WebsiteInner />
    </Gated>
  );
}

function WebsiteInner() {
  const search = Route.useSearch();
  const opened = useRef(false);
  const [data, setData] = useState<SiteData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<SiteKind>("announcement");
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(emptyItem("event"));
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [settings, setSettings] = useState({
    publicTitle: "",
    publicTagline: "",
    about: "",
    contactEmail: "",
  });

  function load() {
    setErr(null);
    listSite()
      .then((d) => {
        setData(d);
        setSettings({
          publicTitle: d.settings.public_title,
          publicTagline: d.settings.public_tagline ?? "",
          about: d.settings.about ?? "",
          contactEmail: d.settings.contact_email ?? "",
        });
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not open the shelf"));
  }
  useEffect(load, []);

  const rows = useMemo(() => (data?.items ?? []).filter((i) => i.kind === tab), [data, tab]);
  const conferences = useMemo(
    () => (data?.items ?? []).filter((i) => i.kind === "event" && i.layout === "conference" && i.id !== form.id),
    [data, form.id],
  );
  const onConference = form.layout === "conference";
  const onProgram = Boolean(form.conferenceId);
  const isTalk = form.kind === "article" && Boolean(form.conferenceId);

  function startEdit(item: SiteItem) {
    setForm({
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: item.subtitle ?? "",
      summary: item.summary ?? "",
      url: item.url ?? "",
      location: item.location ?? "",
      whenLabel: item.when_label ?? "",
      audience: item.audience ?? "",
      featured: Boolean(item.featured),
      published: Boolean(item.published),
      onShelf: item.on_shelf !== false,
      slug: item.slug ?? "",
      body: item.body ?? "",
      layout: item.layout === "conference" ? "conference" : "page",
      conferenceId: item.conference_id ?? "",
      imageId: item.image_id ?? "",
      gatheringId: item.gathering_id ?? "",
      startsOn: item.starts_on ?? "",
      endsOn: item.ends_on ?? "",
    });
    setPendingFile(null);
  }

  useEffect(() => {
    if (!data || opened.current) return;
    if (search.item) {
      const item = data.items.find((row) => row.id === search.item);
      if (!item) return;
      setTab(item.kind);
      startEdit(item);
      opened.current = true;
    } else if (search.announce) {
      setTab("announcement");
      setPendingFile(null);
      setForm({ ...emptyItem("announcement"), gatheringId: search.announce });
      opened.current = true;
    }
  }, [data, search.announce, search.item]);

  if (err) return <p className="text-danger">{err}</p>;
  if (!data) return <p className="text-muted">Opening the website shelf…</p>;
  const canEdit = data.member.role !== "viewer";
  const suggestedStart =
    form.kind === "event" && form.id
      ? ((data.gatherings ?? []).find((gathering) => gathering.public_item_id === form.id)?.starts_on ?? null)
      : null;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Website</h1>
          <p className="text-ink-soft">
            Edit published copy here. Items marked published appear on scs-wisconsin-usa.org after you add the embed
            script (see docs/PUBLISH.md). CRM people never go on the public site.
          </p>
        </div>
        <a href="/site">
          <Button variant="secondary">Preview</Button>
        </a>
      </header>

      <section className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">
        <h2 className="font-display text-xl text-ink">Publish to the public site</h2>
        <p className="mt-2">
          Add this to the GoDaddy page (once). Then Save masthead / Save item here; the public site refreshes within a
          minute.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-paper p-3 text-xs text-ink">{`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/embed/chapter-site.js" defer></script>
<h1 data-scs="title"></h1>
<p data-scs="tagline"></p>
<p data-scs="about"></p>
<div data-scs-list="event"></div>
<div data-scs-list="announcement"></div>
<div data-scs-list="article"></div>
<div data-scs-list="document"></div>
<div data-scs-list="course"></div>`}</pre>
        {canEdit && (
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={async () => {
              const origin = window.location.origin;
              const snippet = `<script src="${origin}/embed/chapter-site.js" defer></script>\n<div data-scs-list="event"></div>`;
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
              toast.success("Snippet copied");
            }}
          >
            {copied ? "Copied" : "Copy short snippet"}
          </Button>
        )}
      </section>

      <form
        className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await saveSiteSettings({ data: settings });
            toast.success("Masthead saved");
            load();
          } catch (ex) {
            toast.error(ex instanceof Error ? ex.message : "Could not save");
          }
        }}
      >
        <h2 className="font-display text-xl sm:col-span-2">Masthead</h2>
        <Field label="Public title">
          <Input
            value={settings.publicTitle}
            onChange={(e) => setSettings({ ...settings, publicTitle: e.target.value })}
            disabled={!canEdit}
            required
          />
        </Field>
        <Field label="Tagline">
          <Input
            value={settings.publicTagline}
            onChange={(e) => setSettings({ ...settings, publicTagline: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Contact email">
          <Input
            type="email"
            value={settings.contactEmail}
            onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="About">
            <Textarea
              value={settings.about}
              onChange={(e) => setSettings({ ...settings, about: e.target.value })}
              disabled={!canEdit}
            />
            <p className="mt-1 text-xs text-muted">Start with <code>{"<section>"}</code> for HTML.</p>
            <CopyPreview value={settings.about} />
          </Field>
        </div>
        {canEdit && (
          <div>
            <Button type="submit">Save masthead</Button>
          </div>
        )}
      </form>

      <div className="flex flex-wrap gap-2">
        {data.kinds.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`min-h-11 rounded-full px-3 py-1 text-sm ${tab === k.key ? "bg-ink text-paper" : "bg-paper-2"}`}
            onClick={() => {
              setTab(k.key);
              setForm(emptyItem(k.key));
              setPendingFile(null);
            }}
          >
            {k.label}
            <span className="ml-2 text-xs opacity-70">{data.items.filter((i) => i.kind === k.key).length}</span>
          </button>
        ))}
      </div>

      {canEdit && (
        <form
          className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              let imageId = form.imageId;
              if (pendingFile) {
                if (pendingFile.size > 1_500_000) throw new Error("That picture is larger than 1.5 MB.");
                const uploaded = await uploadSiteImage({ data: { data: await fileToBase64(pendingFile) } });
                imageId = uploaded.id;
              }
              const saved = await saveSiteItem({
                data: {
                  id: form.id || undefined,
                  kind: form.kind,
                  title: form.title,
                  subtitle: form.subtitle,
                  summary: form.summary,
                  url: form.url,
                  location: form.location,
                  whenLabel: form.whenLabel,
                  audience: form.audience,
                  featured: form.featured,
                  published: form.published,
                  onShelf: isTalk ? form.onShelf : undefined,
                  slug: form.slug,
                  body: form.body,
                  layout: form.kind === "event" && form.layout === "conference" ? "conference" : "page",
                  conferenceId: form.kind === "event" ? "" : form.conferenceId,
                  imageId,
                  gatheringId: form.kind === "announcement" ? form.gatheringId : "",
                  ...(form.kind === "event" ? { startsOn: form.startsOn, endsOn: form.endsOn } : {}),
                  ...(form.kind === "announcement" || form.kind === "course" ? { endsOn: form.endsOn } : {}),
                },
              });
              const previous = form.id ? data.items.find((item) => item.id === form.id) : undefined;
              const datesKind = form.kind === "event" || form.kind === "announcement" || form.kind === "course";
              const row = {
                id: saved.id,
                kind: form.kind,
                title: form.title.trim(),
                subtitle: form.subtitle || null,
                summary: form.summary || null,
                url: form.url || null,
                location: form.location || null,
                when_label: form.whenLabel || null,
                audience: form.audience || null,
                featured: form.featured,
                published: form.published,
                on_shelf: isTalk ? form.onShelf : true,
                sort_order: 0,
                slug: saved.slug ?? (form.slug || null),
                body: form.body || null,
                layout: form.kind === "event" && form.layout === "conference" ? "conference" : "page",
                conference_id: form.kind === "event" ? null : form.conferenceId || null,
                image_id: imageId || null,
                gathering_id: form.kind === "announcement" ? form.gatheringId || null : null,
                starts_on: form.kind === "event" ? form.startsOn || null : (previous?.starts_on ?? null),
                ends_on: datesKind ? form.endsOn || null : (previous?.ends_on ?? null),
              };
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      items: form.id
                        ? prev.items.map((i) => (i.id === form.id ? { ...i, ...row } : i))
                        : [...prev.items, row],
                    }
                  : prev,
              );
              toast.success(form.id ? "Updated" : "Added to the shelf");
              setPendingFile(null);
              setForm(emptyItem(tab));
              load();
            } catch (ex) {
              toast.error(ex instanceof Error ? ex.message : "Could not save");
            }
          }}
        >
          <h2 className="font-display text-xl sm:col-span-2">{form.id ? "Edit item" : `Add ${tab}`}</h2>
          <Field label="Title">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </Field>
          <Field label="Kind">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SiteKind })}>
              {data.kinds.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          {form.kind === "announcement" ? (
            <Field label="Event">
              <Select value={form.gatheringId} onChange={(e) => setForm({ ...form, gatheringId: e.target.value })}>
                <option value="">Not for a specific event</option>
                {(data.gatherings ?? []).map((gathering) => (
                  <option key={gathering.id} value={gathering.id}>
                    {gathering.title}
                  </option>
                ))}
              </Select>
              <p className="text-sm text-ink-soft">
                The public announcement shows that event's web page, plus the title, summary, and page you write here.
              </p>
            </Field>
          ) : null}
          {form.kind === "event" ? (
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="size-5"
                checked={onConference}
                onChange={(e) =>
                  setForm({
                    ...form,
                    layout: e.target.checked ? "conference" : "page",
                    conferenceId: e.target.checked ? "" : form.conferenceId,
                  })
                }
              />
              Conference page
            </label>
          ) : conferences.length > 0 ? (
            <Field label="Show on conference">
              <Select
                value={form.conferenceId}
                onChange={(e) => setForm({ ...form, conferenceId: e.target.value, layout: "page" })}
              >
                <option value="">Not on a conference page</option>
                {conferences.map((conference) => (
                  <option key={conference.id} value={conference.id}>
                    {conference.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {onConference ? (
            <p className="text-sm text-ink-soft sm:col-span-2">
              Title, headline, summary, when, where, and the register link fill the top of the page. The Page field is
              the longer introduction. Add talks as Articles, workshops as Courses, and practical notes as Documents,
              then choose this conference under Show on conference. Type each speaker in the article subtitle, and
              choose a headshot file on that article. Choose a venue photo file on this event. People in the book are
              not copied onto the page.
            </p>
          ) : null}
          {(form.kind === "event" || (onProgram && (form.kind === "article" || form.kind === "course"))) && (
            <Field label="When">
              <Input
                value={form.whenLabel}
                onChange={(e) => setForm({ ...form, whenLabel: e.target.value })}
                placeholder="April 16, 2027 · 9:00 a.m."
              />
            </Field>
          )}
          {form.kind === "event" ? (
            <>
              <Field label="Starts">
                <Input
                  type="date"
                  value={form.startsOn}
                  onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
                />
              </Field>
              <Field label="Ends">
                <Input type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
              </Field>
              {suggestedStart && !form.startsOn ? (
                <p className="text-sm text-ink-soft sm:col-span-2">
                  This gathering is on {whenLabelFor(suggestedStart) ?? suggestedStart}.{" "}
                  <button
                    type="button"
                    className="text-bronze underline-offset-2 hover:underline"
                    onClick={() => setForm({ ...form, startsOn: suggestedStart })}
                  >
                    Use this date
                  </button>
                </p>
              ) : null}
              <p className="text-sm text-ink-soft sm:col-span-2">
                Leave When blank to use these dates. The event leaves Upcoming after its end date, or its start date when
                there is no end.
              </p>
            </>
          ) : null}
          {form.kind === "announcement" || form.kind === "course" ? (
            <Field label="Show until">
              <Input type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
              <p className="text-sm text-ink-soft">After this date the item leaves the public lists. Its page stays up.</p>
            </Field>
          ) : null}
          {form.kind === "event" && (
            <Field label="Where">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Parish, city"
              />
            </Field>
          )}
          {onConference ? (
            <PictureField
              label="Venue photo"
              imageId={form.imageId}
              file={pendingFile}
              onFile={setPendingFile}
              onClear={() => {
                setPendingFile(null);
                setForm({ ...form, imageId: "" });
              }}
            />
          ) : null}
          {(form.kind === "course" || (onProgram && form.kind === "article")) && (
            <Field label={onProgram ? "Track" : "Audience"}>
              <Input
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                placeholder={onProgram ? "How it works" : "Clergy & religious"}
              />
            </Field>
          )}
          <Field
            label={
              onConference
                ? "Headline"
                : onProgram && form.kind === "article"
                  ? "Speaker"
                  : form.kind === "article"
                    ? "Authors / journal"
                    : "Subtitle"
            }
          >
            {onProgram && form.kind === "article" ? (
              <p className="text-sm text-ink-soft">Type the speaker here. People in the book are not copied onto the page.</p>
            ) : null}
            <Input
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              placeholder={onProgram && form.kind === "article" ? "Name, role, institution" : undefined}
            />
          </Field>
          {onProgram && form.kind === "article" ? (
            <PictureField
              label="Headshot"
              imageId={form.imageId}
              file={pendingFile}
              onFile={setPendingFile}
              onClear={() => {
                setPendingFile(null);
                setForm({ ...form, imageId: "" });
              }}
            />
          ) : null}
          <Field label={onConference ? "Register link" : "Link"}>
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Summary">
              <p className="mb-1 text-sm text-ink-soft">
                {form.kind === "announcement" ? (
                  <>
                    Short text on the homepage list, or one <code>{"<section>…</section>"}</code> of HTML for rich
                    content.
                  </>
                ) : onConference ? (
                  "Short text under the headline."
                ) : onProgram && form.kind === "article" ? (
                  "Abstract for this talk."
                ) : (
                  "Short text on the homepage list."
                )}
              </p>
              <Textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                className={form.kind === "announcement" ? "min-h-32" : undefined}
              />
              <p className="mt-1 text-xs text-muted">Start with <code>{"<section>"}</code> for HTML.</p>
              <CopyPreview value={form.summary} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Page">
              <p className="mb-1 text-sm text-ink-soft">
                {form.kind === "announcement" ? (
                  <>
                    Full public page at /p/… . Press Enter for a new paragraph, or use HTML
                    (<code>p</code>, headings, lists, links). Or one{" "}
                    <code>{"<section>…</section>"}</code> of HTML. No length limit.
                  </>
                ) : onConference ? (
                  "Longer introduction. Press Enter for a new paragraph, or use HTML (p, headings, lists, links). The public address is /p/… ."
                ) : onProgram && form.kind === "article" ? (
                  "Optional longer text. Press Enter for a new paragraph, or use HTML. The public address is /p/… ."
                ) : (
                  "Full public page. Press Enter for a new paragraph, or use HTML (p, headings, lists, links). Saved pages are at /p/… on Chapter Book."
                )}
              </p>
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="min-h-48"
              />
              <p className="mt-1 text-xs text-muted">Start with <code>{"<section>"}</code> for HTML.</p>
              <CopyPreview value={form.body} />
            </Field>
          </div>
          <Field label="Page address">
            <Input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder={onConference ? "ai-conference" : "gold-mass-milwaukee"}
            />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            Published
          </label>
          {isTalk ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={form.onShelf}
                onChange={(e) => setForm({ ...form, onShelf: e.target.checked })}
              />
              Also list on the Articles shelf
            </label>
          ) : null}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
            />
            Featured{onProgram && form.kind === "article" ? " — keynote" : ""}
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit">{form.id ? "Save changes" : "Add to shelf"}</Button>
            {form.id ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPendingFile(null);
                  setForm(emptyItem(tab));
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      )}

      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.map((item) => {
          const rich = publicCopyHtml(item.summary) ?? (item.summary?.trim() ? null : publicCopyHtml(item.body));
          return (
          <li key={item.id} className="px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{item.title}</p>
                  {item.layout === "conference" ? <Badge tone="bronze">Conference</Badge> : null}
                  {(data.gatherings ?? []).some((gathering) => gathering.public_item_id === item.id) ? (
                    <Badge tone="bronze">Event page</Badge>
                  ) : null}
                  {item.kind === "announcement" && item.gathering_id ? (
                    <Badge>
                      {(data.gatherings ?? []).find((gathering) => gathering.id === item.gathering_id)?.title ?? "Event"}
                    </Badge>
                  ) : null}
                  {item.kind === "article" && item.conference_id ? (
                    <Badge>
                      Talk on {data.items.find((row) => row.id === item.conference_id)?.title ?? "the conference"}
                    </Badge>
                  ) : null}
                  {item.kind === "article" && item.conference_id && item.on_shelf === false ? (
                    <Badge>Conference page only</Badge>
                  ) : null}
                  {item.featured ? <Badge tone="bronze">Featured</Badge> : null}
                  {!item.published ? <Badge>Draft</Badge> : null}
                </div>
                {item.subtitle ? <p className="text-sm text-ink-soft">{item.subtitle}</p> : null}
                {item.when_label || item.location ? (
                  <p className="text-sm text-muted">{[item.when_label, item.location].filter(Boolean).join(" · ")}</p>
                ) : null}
                {item.audience ? <p className="text-sm text-muted">{item.audience}</p> : null}
                {rich ? (
                  <div
                    className="announcement-html mt-2 text-sm text-ink-soft"
                    dangerouslySetInnerHTML={{ __html: rich }}
                  />
                ) : item.summary ? (
                  <p className="mt-1 text-sm text-ink-soft">{item.summary}</p>
                ) : null}
                {item.slug ? (
                  <a
                    href={item.published ? `/p/${item.slug}` : `/p/${item.slug}?preview=1`}
                    className="mt-1 inline-block text-sm text-bronze hover:underline"
                  >
                    {item.published ? "Open page" : "Preview draft"}
                  </a>
                ) : null}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="secondary" onClick={() => startEdit(item)}>
                    Edit
                  </Button>
                  <ConfirmRemove
                    title={item.title}
                    onConfirm={async () => {
                      try {
                        await removeSiteItem({ data: { id: item.id } });
                        if (form.id === item.id) {
                          setPendingFile(null);
                          setForm(emptyItem(tab));
                        }
                        toast.success("Removed");
                        load();
                      } catch (ex) {
                        toast.error(ex instanceof Error ? ex.message : "Could not remove");
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </li>
          );
        })}
        {rows.length === 0 && <li className="px-4 py-8 text-muted">Nothing on this shelf yet.</li>}
      </ul>
    </div>
  );
}


