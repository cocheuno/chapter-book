export function DuplicateHint({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <p className="rounded-md border border-bronze/30 bg-paper-2 px-3 py-2 text-sm text-ink">
      {children}{" "}
      <a href={href} className="font-medium text-bronze underline-offset-2 hover:underline">
        Open it
      </a>
    </p>
  );
}
