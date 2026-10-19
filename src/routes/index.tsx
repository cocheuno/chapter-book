import { createFileRoute, Link } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskAssigneeSelect } from "@/components/task-assignee";
import { addClergyCheckTask, getHome, setTaskStatus } from "@/lib/crm/actions";
import { hatLabel } from "@/lib/crm/constants";
import { DEFAULT_TZ, formatWhen } from "@/lib/crm/format";
import { CLERGY_CHECK_TITLE } from "@/lib/crm/person-status";
import { listAssignees, setTaskAssignee } from "@/lib/crm/task-assign";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  return (
    <Gated>
      <HomeInner />
    </Gated>
  );
}

function HomeInner() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getHome>> | null>(null);
  const [assignees, setAssignees] = useState<{ userId: string; name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  function load() {
    getHome()
      .then((home) => {
        setData(home);
        if (home.member.role === "viewer") {
          setAssignees([]);
          return;
        }
        listAssignees()
          .then(setAssignees)
          .catch(() => setAssignees([]));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load"));
  }
  useEffect(load, []);
  if (err) return <p className="text-danger">{err}</p>;
  if (!data) return <p className="text-muted">Gathering the chapter…</p>;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm tracking-wide text-muted uppercase">{data.member.chapterName}</p>
        <h1 className="font-display text-3xl">Home</h1>
      </header>

      {data.clergyReminder && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl">{CLERGY_CHECK_TITLE}</h2>
          {data.clergyTaskExists ? (
            <p className="mt-2 text-ink-soft">Task added.</p>
          ) : (
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await addClergyCheckTask();
                    load();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not add the task");
                  }
                }}
              >
                Make it a task
              </Button>
            </div>
          )}
        </section>
      )}

      {data.nextEvent ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <p className="text-xs tracking-wide text-muted uppercase">Next gathering</p>
          <h2 className="mt-1 font-display text-2xl">{data.nextEvent.title}</h2>
          <p className="mt-1 text-ink-soft">
            {data.nextEvent.starts_at
              ? formatWhen(data.nextEvent.starts_at, "short", data.nextEvent.timezone || DEFAULT_TZ)
              : "Date TBA"}
            {data.nextEvent.venue_name ? ` · ${data.nextEvent.venue_name}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Badge tone="ok">{data.rsvp.attending} attending</Badge>
            <Badge>{data.rsvp.notAnswered} no response</Badge>
            <Badge tone="warn">{data.rsvp.declined} declined</Badge>
            <Badge tone="bronze">{data.openChecklist} open tasks</Badge>
          </div>
          {data.nextEvent.celebrant_name && (
            <p className="mt-2 text-sm text-muted">Celebrant: {data.nextEvent.celebrant_name}</p>
          )}
          <div className="mt-4">
            <Link to="/events/$eventId" params={{ eventId: data.nextEvent.id }}>
              <Button>Open workspace</Button>
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-line p-6">
          <p className="font-display text-xl">No gathering on the books.</p>
          <Link to="/events/new" className="mt-3 inline-block">
            <Button>Plan a Gold Mass</Button>
          </Link>
        </section>
      )}

      {data.registrations.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-xl">Registrations</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.registrations.map((row) => (
              <li key={row.eventId}>
                <Link
                  to="/events/$eventId/registrations"
                  params={{ eventId: row.eventId }}
                  className="block px-4 py-3 hover:bg-paper-2"
                >
                  <span className="font-medium">{row.title}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {row.sinceYesterday} since yesterday · {row.activeAttendees} active attendees
                    {" · "}
                    {row.seatsLeft == null ? "No seat limit" : `Seats left: ${row.seatsLeft}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.myTasks.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-xl">My tasks</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.myTasks.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
                <label className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0"
                    checked={false}
                    onChange={() =>
                      setTaskStatus({ data: { id: t.id, status: "done" } })
                        .then(load)
                        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not update"))
                    }
                  />
                  <span>{t.title}</span>
                </label>
                <span className="text-sm text-muted tabular-nums">
                  {t.due_on ?? ""}
                  {t.event_id ? (
                    <>
                      {" "}
                      <Link to="/events/$eventId" params={{ eventId: t.event_id }} className="text-bronze hover:underline">
                        {t.event_title || "Event"}
                      </Link>
                    </>
                  ) : null}
                  {t.hat ? ` · ${hatLabel(t.hat)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-xl">Due this week</h2>
        </div>
        {data.tasks.length === 0 ? (
          <p className="text-muted">Nothing due. Enjoy ordinary time.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.tasks.map((t) => (
              <li key={t.id} className="flex min-h-11 flex-wrap items-center justify-between gap-3 px-4 py-2">
                <span>{t.title}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted tabular-nums">
                  <span>
                    {t.due_on ?? ""}
                    {t.hat ? ` · ${hatLabel(t.hat)}` : ""}
                    {t.assignee_name ? ` · ${t.assignee_name}` : ""}
                  </span>
                  {data.member.role !== "viewer" ? (
                    <TaskAssigneeSelect
                      assigneeId={t.assignee_user_id}
                      assigneeName={t.assignee_name}
                      assignees={assignees}
                      onChange={(userId) =>
                        setTaskAssignee({ data: { taskId: t.id, userId } })
                          .then(load)
                          .catch((error) => toast.error(error instanceof Error ? error.message : "Could not assign"))
                      }
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl">Quiet schools this year</h2>
        {data.quietSchools.length === 0 ? (
          <p className="text-muted">Every school partner has been touched since August.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.quietSchools.map((s) => (
              <li key={s.id}>
                <Link
                  to="/partners/$orgId"
                  params={{ orgId: s.id }}
                  className="block rounded-lg border border-line bg-surface px-4 py-3 hover:bg-paper-2"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {s.has_chair ? s.city : "No science chair on file"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
