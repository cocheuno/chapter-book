import { RedirectToSignIn } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSessionContext } from "@/lib/crm/member";
import { Button } from "./ui/button";
import { AppShell } from "./app-shell";
import { useEffect, useState } from "react";

export function Gated({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const [gate, setGate] = useState<"load" | "in" | "out">("load");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setGate("out");
      return;
    }
    let alive = true;
    getSessionContext()
      .then(() => {
        if (alive) setGate("in");
      })
      .catch((e) => {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "You are not an operator of this chapter.";
        setReason(msg);
        setGate("out");
      });
    return () => {
      alive = false;
    };
  }, [user, isPending]);

  if (isPending || (user && gate === "load")) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper text-muted">
        Opening the book…
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (reason) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
        <div className="max-w-sm space-y-4">
          <p>{reason}</p>
          <p className="text-sm text-ink-soft">Ask a chapter admin for an invite.</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void signOut("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </main>
    );
  }
  if (gate !== "in") return <RedirectToSignIn />;
  return <AppShell>{children}</AppShell>;
}
