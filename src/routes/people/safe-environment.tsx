import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumbs } from "@/components/crumbs";
import { Gated } from "@/components/gate";
import { getSessionContext } from "@/lib/crm/member";
import { clearanceLabel } from "@/lib/crm/safe-environment";
import { listSafeEnvironment } from "@/lib/crm/safe-environment-server";
import { useListHref } from "@/lib/nav/nav-store";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type StatusFilter = "all" | "cleared" | "not_cleared";

function readStatus(value: unknown): StatusFilter {
  if (value === "cleared" || value === "not_cleared" || value === "all") return value;
  return "all";
}

export const Route = createFileRoute("/people/safe-environment")({
  validateSearch: (search: Record<string, unknown>): { status: StatusFilter } => ({
    status: readStatus(search.status),
  }),
  component: SafeEnvironmentPage,
});

type Listed = Awaited<ReturnType<typeof listSafeEnvironment>>[number];

function SafeEnvironmentPage() {
  return (
    <Gated>
      <SafeEnvironmentInner />
    </Gated>
  );
}

function SafeEnvironmentInner() {
  const peopleHref = useListHref("people", "/people");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Listed[] | null>(null);

  useEffect(() => {
    let current = true;
    getSessionContext()
      .then(async (session) => {
        if (!current) return;
        const edit = session.role === "admin" || session.role === "editor";
        setCanEdit(edit);
        if (!edit) return;
        try {
          const list = await listSafeEnvironment();
          if (current) setRows(list);
        } catch (err) {
          if (!current) return;
          setRows([]);
          toast.error(err instanceof Error ? err.message : "Could not load");
        }
      })
      .catch(() => {
        if (current) setCanEdit(false);
      });
    return () => {
      current = false;
    };
  }, []);

  const cleared = rows?.filter((row) => row.clearance === "cleared").length ?? 0;
  const notCleared = rows == null ? 0 : rows.length - cleared;
  const visible =
    rows?.filter((row) => {
      if (search.status === "cleared") return row.clearance === "cleared";
      if (search.status === "not_cleared") return row.clearance !== "cleared";
      return true;
    }) ?? [];

  function choose(status: StatusFilter) {
    void navigate({ search: { status }, replace: true });
  }

  return (
    <div className="space-y-6">
      <Crumbs trail={[{ label: "People", to: peopleHref }, { label: "Safe environment" }]} />
      <div>
        <h1 className="font-display text-3xl">Safe environment</h1>
        {canEdit && rows ? (
          <p className="text-ink-soft">
            Volunteers with minors: {cleared} cleared / {notCleared} not cleared
          </p>
        ) : null}
      </div>
      {canEdit === false ? <p>Viewers can look, not edit.</p> : null}
      {canEdit && rows ? (
        <>
          <div className="flex flex-wrap gap-2">
            <FilterChip label="All" on={search.status === "all"} onClick={() => choose("all")} />
            <FilterChip
              label="Cleared"
              on={search.status === "cleared"}
              onClick={() => choose("cleared")}
            />
            <FilterChip
              label="Not cleared"
              on={search.status === "not_cleared"}
              onClick={() => choose("not_cleared")}
            />
          </div>
          {rows.length === 0 ? (
            <p className="text-muted">No one is marked as working with minors.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-3 text-muted">
                      No one matches this filter.
                    </td>
                  </tr>
                ) : null}
                {visible.map((row) => (
                  <tr key={row.id} className="border-b border-line">
                    <td className="py-2 pr-3">
                      <Link
                        to="/people/$personId"
                        params={{ personId: row.id }}
                        className="font-medium text-bronze underline-offset-2 hover:underline"
                      >
                        {row.display_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{clearanceLabel(row.clearance)}</td>
                    <td className="py-2">{row.soonestExpiry ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </div>
  );
}

function FilterChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-full px-3 py-1 text-sm ${on ? "bg-ink text-paper" : "bg-paper-2"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
