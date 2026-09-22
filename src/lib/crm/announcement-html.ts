/**
 * Announcement copy is plain text unless the whole value is one <section>…</section>.
 * That section is sanitized before it is shown on the public site.
 */

const DROP_CONTENTS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "svg",
  "math",
  "noscript",
  "template",
  "textarea",
  "title",
  "head",
]);

const ALLOWED = new Set([
  "section",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "div",
  "span",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "small",
  "sub",
  "sup",
  "mark",
  "cite",
  "q",
  "abbr",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "img",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "dl",
  "dt",
  "dd",
]);

const VOID = new Set(["br", "hr", "img"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  middot: "\u00b7",
  bull: "\u2022",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  deg: "\u00b0",
  times: "\u00d7",
  divide: "\u00f7",
};

const STYLE_BAD =
  /expression\s*\(|javascript\s*:|vbscript\s*:|@import|-moz-binding|behavior\s*:|<\/|url\s*\(/i;

type Attr = { name: string; value: string };
type TextNode = { kind: "text"; text: string };
type ElNode = { kind: "el"; name: string; attrs: Attr[]; children: Node[] };
type Node = TextNode | ElNode;

export type PublicSummary = {
  summary: string | null;
  summaryHtml: string | null;
};

function safeCodePoint(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 0x10ffff) return null;
  if (n <= 8 || n === 11 || n === 12 || (n >= 14 && n <= 31) || (n >= 0xd800 && n <= 0xdfff)) return "";
  return String.fromCodePoint(n);
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const n = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      const ch = safeCodePoint(n);
      return ch === null ? all : ch;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? all;
  });
}

function escapeText(s: string): string {
  return s
    .replace(/&(?!#\d+;|#x[0-9a-f]+;|[a-z][a-z0-9]+;)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

/** Relative links in announcement HTML belong to the public chapter site, not Chapter Book. */
const CHAPTER_SITE = "https://scs-wisconsin-usa.org/";

function safeUrl(value: string, kind: "href" | "src"): string | null {
  const v = value.trim();
  if (!v || v.length > 2000 || /[\u0000-\u001f\u007f]/.test(v) || v.startsWith("//")) return null;
  if (v.startsWith("#")) {
    if (kind === "src" || !/^#[^\s<>"']*$/.test(v)) return null;
    return v;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    let url: URL;
    try {
      url = new URL(v);
    } catch {
      return null;
    }
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    if (kind === "href" && (url.protocol === "mailto:" || url.protocol === "tel:")) return v;
    return null;
  }
  if (/[\s<>"']/.test(v)) return null;
  try {
    const url = new URL(v, CHAPTER_SITE);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function safeStyle(value: string): string | null {
  const v = value.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!v || v.length > 800 || STYLE_BAD.test(v)) return null;
  return v;
}

function token(value: string, pattern: RegExp, max: number): string | null {
  const v = value.trim();
  if (!v || v.length > max || !pattern.test(v)) return null;
  return v;
}

function sanitizeAttrs(tag: string, attrs: Attr[]): Attr[] {
  const out: Attr[] = [];
  let href: string | null = null;
  let targetBlank = false;
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    if (!/^[a-z_:][\w:.-]*$/i.test(name) || name.startsWith("on")) continue;
    const value = attr.value;
    if (name === "class") {
      const v = token(value, /^[A-Za-z0-9_:\- ]+$/, 200);
      if (v) out.push({ name: "class", value: v });
    } else if (name === "id") {
      const v = token(value, /^[A-Za-z][\w:\-]*$/, 80);
      if (v) out.push({ name: "id", value: v });
    } else if (name === "title" || name === "alt") {
      const v = value.trim();
      if (v && v.length <= 300) out.push({ name, value: v });
    } else if (name === "style") {
      const v = safeStyle(value);
      if (v) out.push({ name: "style", value: v });
    } else if (tag === "a" && name === "href") {
      href = safeUrl(value, "href");
    } else if (tag === "a" && name === "target" && value.trim().toLowerCase() === "_blank") {
      targetBlank = true;
    } else if (tag === "img" && name === "src") {
      const v = safeUrl(value, "src");
      if (v) out.push({ name: "src", value: v });
    } else if (tag === "img" && (name === "width" || name === "height")) {
      const v = token(value, /^\d{1,4}(px|%)?$/, 8);
      if (v) out.push({ name, value: v });
    } else if ((tag === "td" || tag === "th") && (name === "colspan" || name === "rowspan")) {
      const v = token(value, /^\d{1,2}$/, 2);
      if (v) out.push({ name, value: v });
    } else if ((tag === "td" || tag === "th") && name === "scope") {
      const v = token(value, /^(col|row|colgroup|rowgroup)$/i, 10);
      if (v) out.push({ name: "scope", value: v.toLowerCase() });
    } else if (tag === "blockquote" && name === "cite") {
      const v = safeUrl(value, "href");
      if (v) out.push({ name: "cite", value: v });
    }
  }
  if (tag === "a" && href) {
    out.push({ name: "href", value: href });
    if (targetBlank) out.push({ name: "target", value: "_blank" });
    out.push({ name: "rel", value: "noreferrer noopener" });
  }
  return out;
}

function parseFragment(html: string): Node[] {
  const root: ElNode = { kind: "el", name: "#root", attrs: [], children: [] };
  const stack: ElNode[] = [root];
  let i = 0;

  const pushText = (text: string) => {
    if (!text) return;
    stack[stack.length - 1].children.push({ kind: "text", text: decodeEntities(text) });
  };

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      pushText(html.slice(i));
      break;
    }
    if (lt > i) pushText(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt + 2);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    if (html.startsWith("</", lt)) {
      const m = /^<\/\s*([a-zA-Z][\w:-]*)\s*>/.exec(html.slice(lt));
      if (!m) {
        pushText("<");
        i = lt + 1;
        continue;
      }
      const name = m[1].toLowerCase();
      i = lt + m[0].length;
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].name === name) {
          stack.length = s;
          break;
        }
      }
      continue;
    }

    const head = html.slice(lt);
    const nameMatch = /^<\s*([a-zA-Z][\w:-]*)/.exec(head);
    if (!nameMatch) {
      pushText("<");
      i = lt + 1;
      continue;
    }
    const name = nameMatch[1].toLowerCase();
    let j = nameMatch[0].length;
    const attrs: Attr[] = [];
    let selfClosing = false;
    while (j < head.length) {
      while (j < head.length && /\s/.test(head[j])) j++;
      if (j >= head.length) break;
      if (head.startsWith("/>", j)) {
        selfClosing = true;
        j += 2;
        break;
      }
      if (head[j] === ">") {
        j += 1;
        break;
      }
      const attrNameMatch = /^[^\s=/>]+/.exec(head.slice(j));
      if (!attrNameMatch) {
        j += 1;
        continue;
      }
      const attrName = attrNameMatch[0];
      j += attrName.length;
      while (j < head.length && /\s/.test(head[j])) j++;
      let attrValue = "";
      if (head[j] === "=") {
        j += 1;
        while (j < head.length && /\s/.test(head[j])) j++;
        if (head[j] === '"' || head[j] === "'") {
          const q = head[j];
          const end = head.indexOf(q, j + 1);
          if (end === -1) {
            attrValue = head.slice(j + 1);
            j = head.length;
          } else {
            attrValue = head.slice(j + 1, end);
            j = end + 1;
          }
        } else {
          const unq = /^[^\s>]+/.exec(head.slice(j));
          attrValue = unq ? unq[0] : "";
          j += attrValue.length;
        }
      }
      attrs.push({ name: attrName, value: decodeEntities(attrValue) });
    }
    i = lt + j;

    if (DROP_CONTENTS.has(name)) {
      if (!selfClosing) {
        const close = new RegExp(`</\\s*${name}\\s*>`, "i");
        const rest = html.slice(i);
        const found = close.exec(rest);
        i = found ? i + found.index + found[0].length : html.length;
      }
      continue;
    }

    const el: ElNode = { kind: "el", name, attrs, children: [] };
    stack[stack.length - 1].children.push(el);
    if (!selfClosing && !VOID.has(name)) stack.push(el);
  }
  return root.children;
}

function sanitizeNodes(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      if (node.text) out.push(node);
      continue;
    }
    const children = VOID.has(node.name) ? [] : sanitizeNodes(node.children);
    if (!ALLOWED.has(node.name)) {
      out.push(...children);
      continue;
    }
    const attrs = sanitizeAttrs(node.name, node.attrs);
    if (node.name === "img" && !attrs.some((a) => a.name === "src")) continue;
    if (node.name === "a" && !attrs.some((a) => a.name === "href")) {
      out.push(...children);
      continue;
    }
    out.push({ kind: "el", name: node.name, attrs, children });
  }
  return out;
}

function serialize(nodes: Node[]): string {
  let html = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      html += escapeText(node.text);
      continue;
    }
    const attrs = node.attrs.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`).join("");
    if (VOID.has(node.name)) {
      html += `<${node.name}${attrs}>`;
      continue;
    }
    html += `<${node.name}${attrs}>${serialize(node.children)}</${node.name}>`;
  }
  return html;
}

/** Sanitized section HTML, or null when the value should stay plain text. */
export function announcementRichHtml(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? "";
  if (!text || !/^<section\b/i.test(text) || !/<\/section>$/i.test(text)) return null;
  const nodes = parseFragment(text);
  const significant = nodes.filter((n) => (n.kind === "text" ? n.text.trim() !== "" : true));
  if (significant.length !== 1 || significant[0].kind !== "el" || significant[0].name !== "section") return null;
  const clean = sanitizeNodes([significant[0]]);
  if (clean.length !== 1 || clean[0].kind !== "el" || clean[0].name !== "section") return null;
  return serialize(clean);
}

/** Visible words of already-sanitized section HTML, for clients that only show text. */
export function announcementPlainText(sanitizedHtml: string): string {
  return sanitizedHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * HTML for an announcement card.
 * A section in the summary wins. If the summary is empty, a section in the page body is the card.
 */
export function announcementCardHtml(
  summary: string | null | undefined,
  body: string | null | undefined,
): string | null {
  const summaryHtml = announcementRichHtml(summary);
  if (summaryHtml) return summaryHtml;
  if (summary?.trim()) return null;
  return announcementRichHtml(body);
}

/** Public list fields. Only announcements may publish a section as HTML. */
export function publicSummaryFields(
  kind: string,
  summary: string | null,
  body: string | null = null,
): PublicSummary {
  if (kind !== "announcement") return { summary, summaryHtml: null };
  const summaryHtml = announcementCardHtml(summary, body);
  return {
    summary: summaryHtml ? announcementPlainText(summaryHtml) : summary,
    summaryHtml,
  };
}
