import { createFileRoute } from "@tanstack/react-router";
import { Gated } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { addListItem, deleteListItem, listAllLists, updateChapter } from "@/lib/crm/actions";
import { getSessionContext } from "@/lib/crm/member";
import {
  inviteOperator,
  listOperators,
  revokeInvite,
  setOperatorDisabled,
  setOperatorRole,
} from "@/lib/crm/operators";
import { LIST_KEYS } from "@/lib/crm/lists";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/chapter/")({ component: ChapterPage });

function ChapterPage() {
  return (
    <Gated>
      <ChapterInner />
    </Gated>
  );
}

function ChapterInner() {
  const [m, setM] = useState<Awaited<ReturnType<typeof getSessionContext>> | null>(null);
  const [form, setForm] = useState({ name: "", contactLine: "", fromName: "", fromAddress: "", replyTo: "", timezone: "America/Chicago" });
  const [lists, setLists] = useState<Awaited<ReturnType<typeof listAllLists>>>([]);
  const [tab, setTab] = useState<(typeof LIST_KEYS)[number]["key"]>("religious_title");
  const [newValue, setNewValue] = useState("");
  const [ops, setOps] = useState<Awaited<ReturnType<typeof listOperators>> | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  function loadLists() {
    listAllLists().then(setLists);
  }

  useEffect(() => {
    getSessionContext().then((c) => {
      setM(c);
      setForm({
        name: c.chapterName,
        contactLine: c.contactLine ?? "",
        fromName: c.fromName,
        fromAddress: c.fromAddress ?? "",
        replyTo: c.replyTo ?? "",
        timezone: c.timezone,
      });
    });
    loadLists();
    listOperators().then(setOps);
  }, []);
  if (!m) return <p className="text-muted">Loading…</p>;
  const isAdmin = m.role === "admin";
  const current = lists.find((l) => l.key === tab);

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="font-display text-3xl">Chapter</h1>
        <p className="text-ink-soft">You are {m.role}. Mailbox, operators, and the lists that fill the dropdowns.</p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl">Operators</h2>
          <p className="text-sm text-ink-soft">
            Invite-only. Copy the link and send it yourself until the chapter mailbox can send mail.
          </p>
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {(ops?.members ?? []).map((row) => (
            <li key={row.user_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{row.name || row.email || row.user_id}</p>
                <p className="text-sm text-muted">
                  {row.email}
                  {row.disabled_at ? " · disabled" : ""}
                  {row.user_id === ops?.selfId ? " · you" : ""}
                </p>
              </div>
              {isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <select
                    className="min-h-11 rounded-lg border border-line bg-paper px-2"
                    value={row.role}
                    disabled={Boolean(row.disabled_at)}
                    onChange={async (e) => {
                      try {
                        await setOperatorRole({
                          data: { userId: row.user_id, role: e.target.value as "admin" | "editor" | "viewer" },
                        });
                        setOps(await listOperators());
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not change role");
                        setOps(await listOperators());
                      }
                    }}
                  >
                    <option value="admin">admin</option>
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await setOperatorDisabled({ data: { userId: row.user_id, disabled: !row.disabled_at } });
                        setOps(await listOperators());
                        toast.success(row.disabled_at ? "Restored" : "Disabled");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not update");
                      }
                    }}
                  >
                    {row.disabled_at ? "Restore" : "Disable"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted">{row.role}</p>
              )}
            </li>
          ))}
        </ul>
        {(ops?.invites.length ?? 0) > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-dashed border-line bg-paper-2">
            {ops?.invites.map((inv) => (
              <li key={inv.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
                <span className="text-sm">
                  {inv.email} · {inv.role} · waiting
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    className="text-sm text-danger hover:underline"
                    onClick={async () => {
                      await revokeInvite({ data: { id: inv.id } });
                      setOps(await listOperators());
                    }}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && (
          <form
            className="space-y-3 rounded-xl border border-line bg-surface p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await inviteOperator({ data: { email: inviteEmail, role: inviteRole } });
                const url = `${window.location.origin}/login?invite=${encodeURIComponent(r.token)}`;
                setInviteLink(url);
                setInviteEmail("");
                setOps(await listOperators());
                toast.success("Invite ready — copy the link");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not invite");
              }
            }}
          >
            <Field label="Invite email">
              <Input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="operator@example.com"
              />
            </Field>
            <Field label="Role">
              <select
                className="min-h-11 w-full rounded-lg border border-line bg-paper px-2"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "editor" | "viewer")}
              >
                <option value="admin">admin</option>
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
            </Field>
            <Button type="submit">Create invite link</Button>
            {inviteLink && (
              <p className="break-all text-sm text-ink-soft">
                {inviteLink}{" "}
                <button
                  type="button"
                  className="text-bronze hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteLink);
                    toast.success("Copied");
                  }}
                >
                  Copy
                </button>
              </p>
            )}
          </form>
        )}
      </section>

      <form
        className="space-y-3 rounded-xl border border-line bg-surface p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await updateChapter({ data: form });
            toast.success("Chapter saved");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Only an admin can change this.");
          }
        }}
      >
        <h2 className="font-display text-xl">Mailbox</h2>
        <Field label="Chapter name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!isAdmin} />
        </Field>
        <Field label="Contact line">
          <Input value={form.contactLine} onChange={(e) => setForm({ ...form, contactLine: e.target.value })} disabled={!isAdmin} />
        </Field>
        <Field label="From name">
          <Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} disabled={!isAdmin} />
        </Field>
        <Field label="From address">
          <Input type="email" value={form.fromAddress} onChange={(e) => setForm({ ...form, fromAddress: e.target.value })} disabled={!isAdmin} />
        </Field>
        <Field label="Reply-to">
          <Input type="email" value={form.replyTo} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} disabled={!isAdmin} />
        </Field>
        <Field label="Timezone">
          <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} disabled={!isAdmin} />
        </Field>
        {isAdmin && <Button type="submit">Save</Button>}
      </form>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl">Lists</h2>
          <p className="text-sm text-ink-soft">
            Religious titles, academic titles, states, and countries. These fill the dropdowns on people and partners.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LIST_KEYS.map((k) => (
            <button
              key={k.key}
              type="button"
              className={`min-h-11 rounded-full px-3 py-1 text-sm ${tab === k.key ? "bg-ink text-paper" : "bg-paper-2"}`}
              onClick={() => {
                setTab(k.key);
                setNewValue("");
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {(current?.items ?? []).map((item) => (
            <li key={item.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
              <span>{item.value}</span>
              {isAdmin && (
                <button
                  type="button"
                  className="text-sm text-danger hover:underline"
                  onClick={async () => {
                    await deleteListItem({ data: { id: item.id } });
                    loadLists();
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
          {(current?.items.length ?? 0) === 0 && <li className="px-4 py-6 text-muted">This list is empty.</li>}
        </ul>
        {isAdmin ? (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newValue.trim()) return;
              try {
                await addListItem({ data: { listKey: tab, value: newValue } });
                setNewValue("");
                loadLists();
                toast.success("Added");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not add");
              }
            }}
          >
            <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Add a value" required />
            <Button type="submit">Add</Button>
          </form>
        ) : (
          <p className="text-sm text-muted">Only an admin can add or remove list values.</p>
        )}
      </section>

      <p className="text-sm text-muted">
        Letters are recorded in the chapter mailroom. Connect your real sending domain on the from-address when you
        publish; the confirm-count step still applies.
      </p>
    </div>
  );
}
