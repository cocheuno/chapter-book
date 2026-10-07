import { biographyParagraphs } from "@/lib/crm/conference-page";
import { publicCopyHtml } from "@/lib/crm/announcement-html";

/** Public text. HTML is shown sanitized. Otherwise each typed line is its own paragraph. */
export function PublicCopy({ text, className }: { text: string | null | undefined; className?: string }) {
  const html = publicCopyHtml(text);
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

/** Sanitized HTML when the value has tags; otherwise exactly the <p> the page printed before. */
export function PublicText({ text, className }: { text: string | null | undefined; className: string }) {
  const html = publicCopyHtml(text);
  if (html) return <div className={`announcement-html ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
  if (!text) return null;
  return <p className={className}>{text}</p>;
}
