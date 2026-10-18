import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumbs } from "@/components/crumbs";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { getSessionContext } from "@/lib/crm/member";
import { checkImport, importPeople } from "@/lib/crm/import";
import {
  IMPORT_FIELDS,
  IMPORT_LIMITS,
  IMPORT_MAX_ROWS,
  formatDifference,
  guessMapping,
  mapRows,
  parseCsv,
  type ImportKind,
  type MappingChoice,
} from "@/lib/crm/import-rules";
import { useListHref } from "@/lib/nav/nav-store";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/people/import")({
  component: ImportPage,
});

const FILE_BYTES = 2 * 1024 * 1024;

const TABS = [
  { id: "new", label: "New" },
  { id: "match", label: "Matches" },
  { id: "possible_duplicate", label: "Possible duplicates" },
  { id: "problems", label: "Problems" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type Checked = Awaited<ReturnType<typeof checkImport>>;

function ImportPage() {
  return (
    <Gated>
      <ImportInner />
    </Gated>
  );
}

function inTab(kind: ImportKind, tab: TabId): boolean {
  if (tab === "problems") return kind === "invalid" || kind === "duplicate_in_file";
  return kind === tab;
}

function tooLong(rows: ReturnType<typeof mapRows>): string | null {
  for (const row of rows) {
    for (const field of IMPORT_FIELDS) {
      if (row[field.key].length > IMPORT_LIMITS[field.key]) {
        return `${field.label} is longer than ${IMPORT_LIMITS[field.key]} characters.`;
      }
    }
  }
  return null;
}

function ImportInner() {
  const peopleHref = useListHref("people", "/people");
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const [fileError, setFileError] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<MappingChoice[]>([]);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [summary, setSummary] = useState<{
    created: number;
    tasks: number;
    skipped: number;
  } | null>(null);
  const [tab, setTab] = useState<TabId>("new");
  const [busy, setBusy] = useState(false);
  const readId = useRef(0);

  useEffect(() => {
    getSessionContext()
      .then((session) => setCanEdit(session.role === "admin" || session.role === "editor"))
      .catch(() => setCanEdit(false));
  }, []);

  function clearCheck() {
    setChecked(null);
    setSummary(null);
  }

  function mappedRows() {
    return mapRows([headers, ...data], mapping);
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    clearCheck();
    setFileError("");
    setHeaders([]);
    setData([]);
    setMapping([]);
    if (file.size > FILE_BYTES) {
      setFileError("This file is larger than 2 MB.");
      event.target.value = "";
      return;
    }
    const id = ++readId.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (id !== readId.current) return;
      const parsed = parseCsv(String(reader.result ?? ""));
      const dataRows = Math.max(0, parsed.length - 1);
      if (parsed.length === 0 || dataRows === 0) {
        setFileError("This file has no rows.");
        event.target.value = "";
        return;
      }
      if (dataRows > IMPORT_MAX_ROWS) {
        setFileError("This file has more than 2,000 rows.");
        event.target.value = "";
        return;
      }
      setHeaders(parsed[0] ?? []);
      setData(parsed.slice(1));
      setMapping(guessMapping(parsed[0] ?? []));
    };
    reader.onerror = () => {
      if (id !== readId.current) return;
      setFileError("Could not read that file.");
      event.target.value = "";
    };
    reader.readAsText(file, "UTF-8");
  }

  function onMapping(index: number, value: MappingChoice) {
    setMapping((current) => current.map((item, i) => (i === index ? value : item)));
    clearCheck();
  }

  async function check() {
    const rows = mappedRows();
    const limit = tooLong(rows);
    if (limit) {
      toast.error(limit);
      return;
    }
    setBusy(true);
    try {
      const result = await checkImport({ data: { rows } });
      setChecked(result);
      setSummary(null);
      setTab("new");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check those rows");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!checked || busy) return;
    const n = checked.rows.filter((item) => item.kind === "new").length;
    const m = checked.rows.filter((item) => item.kind === "match" && item.differences.length > 0).length;
    if (!window.confirm(`Import ${n} new people and make ${m} review tasks?`)) return;
    const rows = mappedRows();
    const limit = tooLong(rows);
    if (limit) {
      toast.error(limit);
      return;
    }
    setBusy(true);
    try {
      const result = await importPeople({ data: { rows } });
      setSummary(result);
      setChecked(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import");
    } finally {
      setBusy(false);
    }
  }

  const newCount = checked?.rows.filter((item) => item.kind === "new").length ?? 0;
  const reviewCount =
    checked?.rows.filter((item) => item.kind === "match" && item.differences.length > 0).length ??
    0;
  const canImport = Boolean(checked) && !busy && (newCount > 0 || reviewCount > 0);
  const visible = checked?.rows.filter((item) => inTab(item.kind, tab)) ?? [];

  return (
    <div className="space-y-6">
      <Crumbs trail={[{ label: "People", to: peopleHref }, { label: "Import" }]} />
      <div>
        <h1 className="font-display text-3xl">Import</h1>
        {canEdit ? (
          <p className="text-ink-soft">
            Map the columns, check for duplicates, then import new people. Existing people stay as
            they are.
          </p>
        ) : null}
      </div>
      {canEdit === false ? <p>Viewers can look, not edit.</p> : null}
      {canEdit ? (
        <>
          <Field label="CSV file">
            <Input type="file" accept=".csv,text/csv" onChange={onFile} />
          </Field>
          <p className="text-sm text-ink-soft">For large lists, import 500 rows at a time.</p>
          {fileError ? <p className="text-sm text-danger">{fileError}</p> : null}
          {headers.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-ink-soft">
                Columns ({data.length} {data.length === 1 ? "row" : "rows"})
              </h2>
              <ul className="space-y-3">
                {headers.map((header, index) => {
                  const samples = data
                    .slice(0, 3)
                    .map((cells) => (cells[index] ?? "").trim() || "—");
                  return (
                    <li
                      key={index}
                      className="grid gap-2 rounded-md border border-line bg-surface p-3 sm:grid-cols-[1fr_16rem] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium" title={header}>
                          {header.trim() || "(blank)"}
                        </p>
                        <p className="truncate text-sm text-muted" title={samples.join(" · ")}>
                          {samples.join(" · ")}
                        </p>
                      </div>
                      <Select
                        aria-label={`Field for ${header.trim() || "column " + (index + 1)}`}
                        value={mapping[index] ?? "ignore"}
                        onChange={(event) => onMapping(index, event.target.value as MappingChoice)}
                      >
                        <option value="ignore">Ignore</option>
                        {IMPORT_FIELDS.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                          </option>
                        ))}
                      </Select>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {headers.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => void check()} disabled={busy}>
                Check rows
              </Button>
              {checked ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void commit()}
                  disabled={!canImport}
                >
                  Import {newCount} new people
                </Button>
              ) : null}
            </div>
          ) : null}
          {checked ? (
            <p className="text-sm text-ink-soft">
              Differences become review tasks. An import does not change an existing person.
            </p>
          ) : null}
          {summary ? (
            <div className="rounded-md border border-line bg-paper-2 p-4 text-sm">
              <p>Created {summary.created}.</p>
              <p>Review tasks made {summary.tasks}.</p>
              <p>Skipped {summary.skipped}.</p>
            </div>
          ) : null}
          {checked ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-soft">
                New {checked.rows.filter((item) => item.kind === "new").length}
                {" · "}
                Matches {checked.rows.filter((item) => item.kind === "match").length}
                {" · "}
                Possible duplicates{" "}
                {checked.rows.filter((item) => item.kind === "possible_duplicate").length}
                {" · "}
                Duplicates in file{" "}
                {checked.rows.filter((item) => item.kind === "duplicate_in_file").length}
                {" · "}
                Invalid {checked.rows.filter((item) => item.kind === "invalid").length}
              </p>
              <div className="flex flex-wrap gap-2">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={tab === item.id}
                    className={`min-h-11 rounded-md px-3 text-sm ${
                      tab === item.id ? "bg-ink text-paper" : "bg-paper-2"
                    }`}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {visible.length === 0 ? (
                <p className="text-sm text-muted">No rows in this group.</p>
              ) : null}
              <ul className="space-y-3">
                {visible.map((item) => (
                  <li
                    key={item.index}
                    className="rounded-md border border-line bg-surface p-3 text-sm"
                  >
                    <ul className="space-y-1">
                      {IMPORT_FIELDS.filter((field) => item.values[field.key]).map((field) => (
                        <li key={field.key}>
                          <span className="text-ink-soft">{field.label}: </span>
                          {item.values[field.key]}
                        </li>
                      ))}
                    </ul>
                    {item.reason ? <p className="mt-2 text-danger">{item.reason}</p> : null}
                    {item.personId ? (
                      <p className="mt-2">
                        <Link
                          to="/people/$personId"
                          params={{ personId: item.personId }}
                          className="font-medium text-bronze underline-offset-2 hover:underline"
                        >
                          {item.personName || "Existing person"}
                        </Link>
                      </p>
                    ) : null}
                    {item.differences.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {item.differences.map((diff) => (
                          <li key={diff.field}>{formatDifference(diff)}</li>
                        ))}
                      </ul>
                    ) : null}
                    {item.kind === "match" && item.differences.length === 0 ? (
                      <p className="mt-2 text-ink-soft">No differences.</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
