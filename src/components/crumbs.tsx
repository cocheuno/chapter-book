import { Link } from "@tanstack/react-router";

type Crumb = { label: string; to?: string };

const crumbLink = "max-w-[40ch] truncate text-bronze hover:underline";

function splitHref(href: string): { path: string; query: URLSearchParams } {
  const queryAt = href.indexOf("?");
  const path = (queryAt === -1 ? href : href.slice(0, queryAt)).replace(/\/+$/, "") || "/";
  return { path, query: new URLSearchParams(queryAt === -1 ? "" : href.slice(queryAt + 1)) };
}

function pathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function NavHref({
  href,
  className,
  title,
  children,
  onClick,
}: {
  href: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const { path, query } = splitHref(href);
  const shared = { className, title, onClick, children };
  const person = path.match(/^\/people\/([^/]+)$/);
  if (person) {
    return <Link to="/people/$personId" params={{ personId: pathSegment(person[1]) }} {...shared} />;
  }
  const partner = path.match(/^\/partners\/([^/]+)$/);
  if (partner) {
    return <Link to="/partners/$orgId" params={{ orgId: pathSegment(partner[1]) }} {...shared} />;
  }
  const event = path.match(/^\/events\/([^/]+)$/);
  if (event) {
    return <Link to="/events/$eventId" params={{ eventId: pathSegment(event[1]) }} {...shared} />;
  }
  const letter = path.match(/^\/mail\/([^/]+)$/);
  if (letter) {
    return <Link to="/mail/$mailingId" params={{ mailingId: pathSegment(letter[1]) }} {...shared} />;
  }
  if (path === "/people") {
    return (
      <Link
        to="/people"
        search={{
          role: query.get("role") || undefined,
          degree: query.get("degree") === "1" ? "1" : undefined,
        }}
        {...shared}
      />
    );
  }
  if (path === "/partners") {
    return <Link to="/partners" search={{ tab: query.get("tab") || undefined }} {...shared} />;
  }
  if (path === "/events") return <Link to="/events" {...shared} />;
  if (path === "/mail") return <Link to="/mail" {...shared} />;
  if (path === "/chapter") return <Link to="/chapter" {...shared} />;
  if (path === "/") return <Link to="/" {...shared} />;
  return (
    <a href={href} className={className} title={title} onClick={onClick}>
      {children}
    </a>
  );
}

export function Crumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {trail.map((item, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={`${index}:${item.label}`} className="flex min-w-0 items-center gap-x-1.5">
              {index > 0 ? (
                <span aria-hidden="true" className="text-muted">
                  ›
                </span>
              ) : null}
              {last || !item.to ? (
                <span className="max-w-[40ch] truncate" title={item.label}>
                  {item.label}
                </span>
              ) : (
                <NavHref href={item.to} className={crumbLink} title={item.label}>
                  {item.label}
                </NavHref>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
