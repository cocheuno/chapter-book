import { twMerge } from "tailwind-merge";

export function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "ok" | "warn" | "bronze";
}) {
  const tones = {
    muted: "bg-paper-2 text-ink-soft",
    ok: "bg-ok/15 text-ok",
    warn: "bg-danger/10 text-danger",
    bronze: "bg-bronze/15 text-bronze",
  };
  return (
    <span className={twMerge("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", tones[tone])}>
      {children}
    </span>
  );
}
