import { Link, useRouterState } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BookOpen, Building2, Calendar, Globe, Home, Mail, Menu, Search, Settings2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { searchAll } from "@/lib/crm/actions";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/people", label: "People", icon: Users },
  { to: "/partners", label: "Partners", icon: Building2 },
  { to: "/events", label: "Events", icon: Calendar },
  { to: "/website", label: "Website", icon: Globe },
  { to: "/mail", label: "Mail", icon: Mail },
  { to: "/chapter", label: "Chapter", icon: Settings2 },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ kind: string; id: string; label: string; hint: string }[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      searchAll({ data: q }).then(setHits).catch(() => setHits([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper text-muted">Opening the book…</div>
    );
  }
  if (!user) return null;

  function hrefFor(h: (typeof hits)[0]) {
    if (h.kind === "person") return `/people/${h.id}`;
    return `/partners/${h.id}`;
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button type="button" className="rounded-md p-2 md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <Link to="/" className="flex items-center gap-2">
            <BookOpen className="size-5 text-bronze" />
            <span className="font-display text-lg tracking-tight">Chapter Book</span>
          </Link>
          <div className="relative ml-auto hidden max-w-sm flex-1 md:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people and partners"
              className="h-11 w-full rounded-md border border-line bg-surface pr-3 pl-9 text-sm"
            />
            {hits.length > 0 && (
              <ul className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
                {hits.map((h) => (
                  <li key={h.kind + h.id}>
                    <a
                      href={hrefFor(h)}
                      className="block px-3 py-2.5 text-sm hover:bg-paper-2"
                      onClick={() => {
                        setQ("");
                        setHits([]);
                      }}
                    >
                      <span className="font-medium">{h.label}</span>
                      <span className="ml-2 text-muted">{h.hint}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="chapter-user ml-2 flex shrink-0 items-center">
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl">
        <nav className={`${open ? "flex" : "hidden"} w-full flex-col border-b border-line md:flex md:w-52 md:border-r md:border-b-0`}>
          {NAV.map((n) => {
            const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center gap-2 px-4 text-sm ${active ? "bg-paper-2 font-medium text-ink" : "text-ink-soft hover:bg-paper-2"}`}
              >
                <Icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
