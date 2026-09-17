import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AppShell } from "./app-shell";

export function Gated({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper text-muted">
        Opening the book…
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <AppShell>{children}</AppShell>;
}
