export const OPERATOR_ROLES = ["admin", "editor", "viewer"] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const INVITE_DAYS = 14;

export const RESET_MINUTES = 60;

/** Why an admin must not issue a reset link, or null if allowed. */
export function resetBlockedReason(t: {
  found: boolean;
  disabled: boolean;
  email: string | null;
}): string | null {
  if (!t.found) return "That operator is not in this book.";
  if (t.disabled) return "Restore this operator before resetting their password.";
  if (t.email == null || t.email.trim() === "") return "That operator has no email address.";
  return null;
}

/** Why a new password cannot be saved, or null if the pair is usable. */
export function newPasswordError(password: string, again: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (password !== again) return "The two passwords do not match.";
  return null;
}

/** A sentence for the login page when Better Auth refuses the new password. */
export function resetErrorMessage(
  err: { code?: string; message?: string } | null | undefined,
): string {
  if (err?.code === "INVALID_TOKEN") {
    return "This reset link has expired or was already used. Ask an admin for a new one.";
  }
  if (err?.code === "PASSWORD_TOO_SHORT") return "Use at least 8 characters.";
  if (err?.code === "PASSWORD_TOO_LONG") return "Use at most 128 characters.";
  return err?.message || "Could not set the password.";
}

/** Node's crypto, loaded only when a token is minted or hashed. The login page never calls this. */
function nodeCrypto(): typeof import("node:crypto") {
  if (typeof process === "undefined" || typeof process.getBuiltinModule !== "function") {
    throw new Error("Password hashing is server-only.");
  }
  return process.getBuiltinModule("node:crypto");
}

export function newInviteToken(): string {
  return nodeCrypto().randomBytes(24).toString("hex");
}

export function hashInviteToken(token: string): string {
  return nodeCrypto().createHash("sha256").update(token, "utf8").digest("hex");
}

export function normalizeOperatorEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Who may open an empty book. A set founder address must match. When it is
 * unset, only a machine with no DATABASE_URL (local PGLite, Grok preview) may.
 */
export function founderAllowed(
  email: string,
  config: { founderEmail?: string; databaseUrl?: string },
): boolean {
  const founderEmail = normalizeOperatorEmail(config.founderEmail ?? "");
  if (founderEmail) return founderEmail === normalizeOperatorEmail(email);
  return (config.databaseUrl ?? "").trim() === "";
}

export type SignUpInvite = {
  email: string;
  expiresAt: string | Date;
  acceptedAt: string | Date | null;
};

/**
 * An account may be created only for the founder path on an empty book,
 * or for an invite that is still open and addressed to this email.
 */
export function signUpAllowed(input: {
  bookEmpty: boolean;
  founderAllowed: boolean;
  email: string;
  invite: SignUpInvite | null;
}): boolean {
  if (input.bookEmpty && input.founderAllowed) return true;
  const invite = input.invite;
  if (!invite || invite.acceptedAt != null) return false;
  const expiresAt = new Date(invite.expiresAt).getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) return false;
  return normalizeOperatorEmail(invite.email) === normalizeOperatorEmail(input.email);
}

export function isOperatorRole(value: string): value is OperatorRole {
  return (OPERATOR_ROLES as readonly string[]).includes(value);
}

/** Why an admin must not disable this row, or null if allowed. */
export function disableBlockedReason(opts: {
  targetUserId: string;
  actorUserId: string;
  targetRole: OperatorRole;
  enabledAdminCount: number;
  alreadyDisabled: boolean;
}): string | null {
  if (opts.alreadyDisabled) return "That operator is already disabled.";
  if (opts.targetRole === "admin" && opts.enabledAdminCount <= 1) {
    return "The book needs at least one admin.";
  }
  return null;
}

/** Why an admin must not change this role, or null if allowed. */
export function roleChangeBlockedReason(opts: {
  targetRole: OperatorRole;
  nextRole: OperatorRole;
  enabledAdminCount: number;
}): string | null {
  if (opts.targetRole === "admin" && opts.nextRole !== "admin" && opts.enabledAdminCount <= 1) {
    return "The book needs at least one admin.";
  }
  return null;
}
