import { createFileRoute } from "@tanstack/react-router";
import { authClient, authEnabled } from "@/lib/auth/client";
import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { getLoginState, peekInvite } from "@/lib/crm/operators";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { invite?: string } => ({
    invite: typeof s.invite === "string" ? s.invite : undefined,
  }),
  component: Login,
});

function Login() {
  const { invite: inviteToken } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [founder, setFounder] = useState(false);
  const [invite, setInvite] = useState<{ email: string; role: string } | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const opening = Boolean(invite) || founder;

  useEffect(() => {
    let alive = true;
    (async () => {
      const state = await getLoginState();
      if (!alive) return;
      setFounder(state.founder);
      if (inviteToken) {
        const p = await peekInvite({ data: inviteToken });
        if (!alive) return;
        if (p.ok) {
          setInvite({ email: p.email, role: p.role });
          setEmail(p.email);
        } else {
          setInviteNote(
            p.reason === "expired"
              ? "That invite has expired. Ask an admin for a new link."
              : p.reason === "used"
                ? "That invite was already used. Sign in if you already opened the book."
                : "That invite link is not valid.",
          );
        }
      }
      setReady(true);
    })().catch(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [inviteToken]);

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (opening) {
        const r = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (r.error) throw new Error(r.error.message || "Could not create the sign-in");
      } else {
        const r = await authClient.signIn.email({ email, password });
        if (r.error) throw new Error(r.error.message || "Could not sign in");
      }
      window.location.href = "/";
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 py-10 text-ink">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <BookOpen className="size-8 text-bronze" />
          <h1 className="font-display text-3xl tracking-tight">Chapter Book</h1>
          <p className="text-pretty text-ink-soft">
            For chapter leadership. Ask an admin for an invite. Two-factor sign-in comes later.
          </p>
        </div>
        {!ready ? (
          <p className="text-muted">Opening the door…</p>
        ) : authEnabled ? (
          <>
            {inviteNote && <p className="text-sm text-danger">{inviteNote}</p>}
            {invite && (
              <p className="text-sm text-ink-soft">
                Invited as <span className="font-medium text-ink">{invite.role}</span>. Set a password for{" "}
                {invite.email}.
              </p>
            )}
            {founder && !invite && (
              <p className="text-sm text-ink-soft">This book has no operators yet. The first sign-in becomes admin.</p>
            )}
            <form onSubmit={onEmail} className="space-y-3">
              {opening && (
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </div>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  readOnly={Boolean(invite)}
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={opening ? "new-password" : "current-password"}
                />
              </div>
              {err && <p className="text-sm text-danger">{err}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {opening ? (founder && !invite ? "Open the book" : "Accept invite") : "Sign in"}
              </Button>
            </form>
            <p className="text-center text-sm">
              <a
                href="https://scs-wisconsin-usa.org/"
                className="text-ink-soft underline-offset-2 hover:underline"
              >
                Public chapter site
              </a>
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
      </div>
    </main>
  );
}
