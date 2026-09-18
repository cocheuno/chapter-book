import { createHash, randomBytes } from "node:crypto";

export const OPERATOR_ROLES = ["admin", "editor", "viewer"] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const INVITE_DAYS = 14;

export function newInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function normalizeOperatorEmail(email: string): string {
  return email.trim().toLowerCase();
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
