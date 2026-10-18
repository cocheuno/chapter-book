import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumbs } from "@/components/crumbs";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { listEvents } from "@/lib/crm/actions";
import { ORG_TYPES, PERSON_ROLES } from "@/lib/crm/constants";
import { getSessionContext } from "@/lib/crm/member";
import type { SegmentFilter } from "@/lib/crm/segment-rules";
import { deleteSegment, listSegments, previewSegment, saveSegment } from "@/lib/crm/segments";
import { listTags } from "@/lib/crm/tags";
import { useListHref } from "@/lib/nav/nav-store";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/people/lists")({
  component: ListsPage,
});

function emptyFilter(): SegmentFilter {
  return {
    roles: [],
    tagIds: [],
    partnerTypes: [],
    city: "",
    state: "",
    attendedEventId: "",
    excludeUnsubscribed: true,
    excludeDoNotContact: true,
    excludeDeceased: true,
  };
}

function copyFilter(filter: SegmentFilter): SegmentFilter {
  return {
    ...filter,
    roles: [...filter.roles],
    tagIds: [...filter.tagIds],
    partnerTypes: [...filter.partnerTypes],
  };
}

function ListsPage() {
  return (
    <Gated>
      <ListsInner />
    </Gated>
  );
}

function ListsInner() {
  const peopleHref = useListHref("people", "/people");
  const [segments, setSegments] = useState<Awaited<ReturnType<typeof listSegments>>>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);
  const [draft, setDraft] = useState<SegmentFilter>(emptyFilter);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewSegment>> | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(false);

  function refresh() {
    listSegments().then(setSegments).catch(() => setSegments([]));
    listTags().then(setTags).catch(() => setTags([]));
  }

  useEffect(() => {
    listSegments().then(setSegments).catch(() => setSegments([]));
    listTags().then(setTags).catch(() => setTags([]));
    listEvents()
      .then((rows) => setEvents(rows.map((row) => ({ id: row.id, title: row.title }))))
      .catch(() => setEvents([]));
    getSessionContext()
      .then((session) => setCanEdit(session.role === "admin" || session.role === "editor"))
      .catch(() => setCanEdit(false));
  }, []);

  function toggle(key: "roles" | "tagIds" | "partnerTypes", value: string) {
    setDraft((current) => {
      const has = current[key].includes(value);
      const next = has ? current[key].filter((item) => item !== value) : [...current[key], value];
      return { ...current, [key]: next };
    });
    setPreview(null);
  }

  function openList(id: string) {
    const segment = segments.find((item) => item.id === id);
    if (!segment) return;
    setSelectedId(segment.id);
    setName(segment.name);
    setDraft(copyFilter(segment.filter));
    setPreview(null);
  }

  async function runPreview() {
    setBusy(true);
    try {
      setPreview(await previewSegment({ data: { filter: draft } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not preview");
    } finally {
      setBusy(false);
    }
  }

  async function saveAs() {
    const nextName = name.trim();
    if (!nextName) return;
    setBusy(true);
    try {
      const saved = await saveSegment({ data: { name: nextName, filter: draft } });
      const rows = await listSegments();
      setSegments(rows);
      const match = rows.find((row) => row.id === saved.id);
      setSelectedId(saved.id);
      if (match) {
        setName(match.name);
        setDraft(copyFilter(match.filter));
      }
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function saveExisting() {
    if (!selectedId) return;
    const nextName = name.trim();
    if (!nextName) return;
    setBusy(true);
    try {
      await saveSegment({ data: { id: selectedId, name: nextName, filter: draft } });
      const rows = await listSegments();
      setSegments(rows);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await deleteSegment({ data: { id: selectedId } });
      setSelectedId(null);
      setName("");
      refresh();
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Crumbs trail={[{ label: "People", to: peopleHref }, { label: "Saved lists" }]} />
      <h1 className="font-display text-3xl">Saved lists</h1>
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-2">
          <h2 className="text-sm font-medium text-ink-soft">Saved lists</h2>
          {segments.length === 0 && <p className="text-sm text-muted">No saved lists yet.</p>}
          <ul className="space-y-1">
            {segments.map((segment) => (
              <li key={segment.id}>
                <button
                  type="button"
                  className={`min-h-11 w-full rounded-md px-3 text-left text-sm ${
                    selectedId === segment.id ? "bg-ink text-paper" : "bg-paper-2"
                  }`}
                  onClick={() => openList(segment.id)}
                >
                  {segment.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="space-y-5">
          <CheckGroup
            legend="Roles"
            options={PERSON_ROLES.map((role) => ({ value: role.key, label: role.label }))}
            selected={draft.roles}
            onToggle={(value) => toggle("roles", value)}
          />
          <CheckGroup
            legend="Tags"
            options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
            selected={draft.tagIds}
            onToggle={(value) => toggle("tagIds", value)}
            empty="No tags yet."
          />
          <CheckGroup
            legend="Partner types"
            options={ORG_TYPES.map((type) => ({ value: type.key, label: type.label }))}
            selected={draft.partnerTypes}
            onToggle={(value) => toggle("partnerTypes", value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="City">
              <Input
                value={draft.city}
                maxLength={100}
                onChange={(e) => {
                  setDraft((current) => ({ ...current, city: e.target.value }));
                  setPreview(null);
                }}
              />
            </Field>
            <Field label="State">
              <Input
                value={draft.state}
                maxLength={100}
                onChange={(e) => {
                  setDraft((current) => ({ ...current, state: e.target.value }));
                  setPreview(null);
                }}
              />
            </Field>
          </div>
          <Field label="Attended event">
            <Select
              value={draft.attendedEventId}
              onChange={(e) => {
                setDraft((current) => ({ ...current, attendedEventId: e.target.value }));
                setPreview(null);
              }}
            >
              <option value="">Any</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <ExcludeBox
              label="Exclude unsubscribed"
              checked={draft.excludeUnsubscribed}
              onChange={(checked) => {
                setDraft((current) => ({ ...current, excludeUnsubscribed: checked }));
                setPreview(null);
              }}
            />
            <ExcludeBox
              label="Exclude do not contact"
              checked={draft.excludeDoNotContact}
              onChange={(checked) => {
                setDraft((current) => ({ ...current, excludeDoNotContact: checked }));
                setPreview(null);
              }}
            />
            <ExcludeBox
              label="Exclude deceased"
              checked={draft.excludeDeceased}
              onChange={(checked) => {
                setDraft((current) => ({ ...current, excludeDeceased: checked }));
                setPreview(null);
              }}
            />
          </div>
          <Button type="button" variant="secondary" onClick={() => void runPreview()} disabled={busy}>
            Preview
          </Button>
          {preview && (
            <div className="space-y-2">
              <p className="text-sm text-ink-soft">
                {preview.count} {preview.count === 1 ? "person" : "people"}
                {preview.count > preview.people.length ? ". Showing the first 200." : ""}
              </p>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {preview.people.map((person) => (
                  <li key={person.id}>
                    <Link
                      to="/people/$personId"
                      params={{ personId: person.id }}
                      className="block min-h-11 px-4 py-2 hover:bg-paper-2"
                    >
                      {person.display_name}
                    </Link>
                  </li>
                ))}
                {preview.people.length === 0 && <li className="px-4 py-6 text-sm text-muted">No one matches.</li>}
              </ul>
            </div>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Save as…">
                <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button type="button" variant="secondary" disabled={busy || !name.trim()} onClick={() => void saveAs()}>
                Save as…
              </Button>
              <Button type="button" disabled={busy || !selectedId || !name.trim()} onClick={() => void saveExisting()}>
                Save
              </Button>
              <Button type="button" variant="danger" disabled={busy || !selectedId} onClick={() => void remove()}>
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckGroup({
  legend,
  options,
  selected,
  onToggle,
  empty,
}: {
  legend: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  empty?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink-soft">{legend}</legend>
      {options.length === 0 && empty ? <p className="text-sm text-muted">{empty}</p> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => onToggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ExcludeBox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
