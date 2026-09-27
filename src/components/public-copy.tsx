import { biographyParagraphs } from "@/lib/crm/conference-page";
import { publicRichHtml } from "@/lib/crm/announcement-html";

/** Public text. HTML is shown sanitized. Otherwise each typed line is its own paragraph. */
export function PublicCopy({ text, className }: { text: string | null | undefined; className?: string }) {
  const html = publicRichHtml(text);
  if (html) {
    return <div className={`announcement-html ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  const parts = biographyParagraphs(text);
  if (!parts.length) return null;
  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {parts.map((part) => (
        <p key={part.slice(0, 48)} className="whitespace-pre-wrap">
          {part}
        </p>
      ))}
    </div>
  );
}
