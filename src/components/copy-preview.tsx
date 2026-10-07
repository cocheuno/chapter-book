import { publicCopyHtml } from "@/lib/crm/announcement-html";

/** What the public will see, shown only when the value has HTML. */
export function CopyPreview({ value }: { value: string | null | undefined }) {
  const html = publicCopyHtml(value);
  if (!html) return null;
  return (
    <div className="mt-2 rounded-lg border border-line bg-paper p-3">
      <p className="text-xs tracking-wide text-muted uppercase">Preview</p>
      <div className="announcement-html mt-1 text-sm text-ink-soft" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
