export const AUDIT_GROUPS = ["operators", "website", "registration", "exports", "mail", "chapter"] as const;

export type AuditGroup = (typeof AUDIT_GROUPS)[number];

export const AUDIT_ACTIONS: Record<string, { label: string; group: AuditGroup }> = {
  operator_invited: { label: "Operator invited", group: "operators" },
  invite_revoked: { label: "Invite revoked", group: "operators" },
  invite_accepted: { label: "Invite accepted", group: "operators" },
  role_changed: { label: "Role changed", group: "operators" },
  operator_disabled: { label: "Operator disabled", group: "operators" },
  operator_restored: { label: "Operator restored", group: "operators" },
  reset_link_created: { label: "Reset link created", group: "operators" },
  account_removed: { label: "Account removed", group: "operators" },
  password_reset_used: { label: "Password reset used", group: "operators" },
  site_item_created: { label: "Website item created", group: "website" },
  site_item_published: { label: "Website item published", group: "website" },
  site_item_unpublished: { label: "Website item unpublished", group: "website" },
  site_item_saved: { label: "Website item saved", group: "website" },
  site_item_removed: { label: "Website item removed", group: "website" },
  site_settings_saved: { label: "Website settings saved", group: "website" },
  conference_copy_saved: { label: "Conference copy saved", group: "website" },
  conference_venue_saved: { label: "Conference venue saved", group: "website" },
  conference_speaker_added: { label: "Speaker added", group: "website" },
  conference_speaker_saved: { label: "Speaker saved", group: "website" },
  conference_speaker_removed: { label: "Speaker removed", group: "website" },
  conference_session_added: { label: "Session added", group: "website" },
  conference_session_saved: { label: "Session saved", group: "website" },
  conference_session_removed: { label: "Session removed", group: "website" },
  event_web_page_set: { label: "Event web page set", group: "website" },
  registration_setup_saved: { label: "Registration setup saved", group: "registration" },
  registration_created: { label: "Registration created", group: "registration" },
  registration_switch: { label: "Registration switch", group: "registration" },
  registration_cancelled: { label: "Registration cancelled", group: "registration" },
  attendee_cancelled: { label: "Attendee cancelled", group: "registration" },
  attendee_renamed: { label: "Attendee renamed", group: "registration" },
  confirmation_viewed: { label: "Confirmation viewed", group: "registration" },
  export: { label: "Export", group: "exports" },
  mailing_sent: { label: "Mail sent", group: "mail" },
  chapter_saved: { label: "Chapter saved", group: "chapter" },
  list_item_removed: { label: "List item removed", group: "chapter" },
};

const SECRET_KEY = /token|hash|password|secret|html|body|link|url/i;

function asText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

/** Field names whose values differ, in the order of `fields`. */
export function changedFields(before: object, after: object, fields: readonly string[]): string[] {
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  return fields.filter((field) => asText(left[field]) !== asText(right[field]));
}

/** One-level copy with secret and bulky keys removed. */
export function safeDetail(detail: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  if (!detail) return copy;
  for (const [key, value] of Object.entries(detail)) {
    if (SECRET_KEY.test(key)) continue;
    copy[key] = value;
  }
  return copy;
}

export function actionsInGroup(group: AuditGroup): string[] {
  return Object.entries(AUDIT_ACTIONS)
    .filter(([, meta]) => meta.group === group)
    .map(([action]) => action);
}

function changedLine(detail: Record<string, unknown>): string {
  if (!Array.isArray(detail.changed) || detail.changed.length === 0) return "";
  return `changed: ${detail.changed.map((field) => String(field)).join(", ")}`;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

/** One short line for the activity list. Unknown actions stay blank. */
export function auditSummary(action: string, detail: Record<string, unknown> | null | undefined): string {
  const row = detail ?? {};
  switch (action) {
    case "role_changed":
    case "attendee_renamed":
      return `${text(row.from)} → ${text(row.to)}`;
    case "site_item_published":
    case "site_item_unpublished":
    case "site_item_saved":
    case "site_settings_saved":
    case "chapter_saved":
      return changedLine(row);
    case "export":
      if (text(row.kind) === "full") return `full export, ${Number(row.rows ?? 0)} rows`;
      return `${Number(row.rows ?? 0)} rows`;
    case "mailing_sent":
      return `${Number(row.recipients ?? 0)} recipients, ${Number(row.skipped ?? 0)} skipped`;
    case "operator_invited":
    case "invite_accepted":
      return [text(row.email), text(row.role)].filter(Boolean).join(", ");
    case "invite_revoked":
    case "operator_disabled":
    case "operator_restored":
    case "reset_link_created":
    case "account_removed":
      return text(row.email);
    case "site_item_created":
      return row.published === true || row.published === "true" ? "published" : "draft";
    case "site_item_removed":
    case "conference_copy_saved":
    case "conference_venue_saved":
    case "conference_speaker_added":
    case "conference_speaker_saved":
    case "conference_speaker_removed":
    case "conference_session_added":
    case "conference_session_saved":
    case "conference_session_removed":
      return text(row.name || row.title);
    case "registration_setup_saved":
      return [text(row.what), text(row.name)].filter(Boolean).join(": ");
    case "registration_switch":
    case "event_web_page_set":
      if (typeof row.enabled === "boolean") return row.enabled ? "on" : "off";
      return row.itemId ? "on" : "off";
    case "registration_created":
      return `${Number(row.attendees ?? 0)} attendees`;
    case "registration_cancelled":
    case "attendee_cancelled":
    case "confirmation_viewed":
      return text(row.code);
    case "list_item_removed":
      return [text(row.list), text(row.value)].filter(Boolean).join(": ");
    default:
      return "";
  }
}

/** Where "Open" goes, or null when the row has nowhere to land. */
export function auditHref(
  entity: string,
  entityId: string | null | undefined,
  detail: Record<string, unknown> | null | undefined,
  action = "",
): string | null {
  const id = entityId ?? "";
  if (entity === "event" && id) return `/events/${id}`;
  if ((entity === "registration" || entity === "registration_attendee") && detail?.eventId) {
    return `/events/${String(detail.eventId)}/registrations`;
  }
  if (entity === "site_item" && id && action !== "site_item_removed") return `/website?item=${id}`;
  if (entity === "mailing" && id) return `/mail/${id}`;
  if (entity === "operator" || entity === "chapter") return "/chapter";
  return null;
}
