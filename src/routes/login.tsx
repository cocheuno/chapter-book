import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "up") {
        const r = await authClient.signUp.email({ email, password, name: name || email.split("@")[0] });
        if (r.error) throw new Error(r.error.message || "Could not create account");
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
            The chapter’s book of people, partners, Gold Masses, and conferences. For leadership. Two-factor sign-in
            from the public site comes later.
          </p>
        </div>
        {authEnabled ? (
          <>
            <div className="space-y-2">
              {GROK_PROVIDERS.map((p) => (
                <Button
                  key={p.providerId}
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                >
                  Continue with {p.label}
                </Button>
              ))}
            </div>
            <p className="text-center text-xs tracking-wide text-muted uppercase">or with email</p>
            <form onSubmit={onEmail} className="space-y-3">
              {mode === "up" && (
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </div>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
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
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                />
              </div>
              {err && <p className="text-sm text-danger">{err}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {mode === "up" ? "Create account" : "Sign in"}
              </Button>
            </form>
            <button
              type="button"
              className="text-sm text-bronze underline-offset-2 hover:underline"
              onClick={() => setMode(mode === "up" ? "in" : "up")}
            >
              {mode === "up" ? "Already have an account? Sign in" : "New volunteer? Create an account"}
            </button>
            <p className="text-center text-sm">
              <a href="/site" className="text-ink-soft underline-offset-2 hover:underline">
                Visit the public chapter site
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
