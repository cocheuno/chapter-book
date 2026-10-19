/** Nametag export is an editor action. A viewer only looks. */
export function mayExportNametags(role: string): boolean {
  return role === "admin" || role === "editor";
}

/** Mail preview lists addresses. A viewer only looks. */
export function mayPreviewMail(role: string): boolean {
  return role === "admin" || role === "editor";
}

/** Turning in-book registration on or off is an admin action. */
export function maySetBookRegistration(role: string): boolean {
  return role === "admin";
}

/** Admins see emails and invites. Editors and viewers see names and roles. */
export function operatorDirectory(role: string): "full" | "names" {
  return role === "admin" ? "full" : "names";
}
