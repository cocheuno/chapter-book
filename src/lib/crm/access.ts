/** True for an admin or an editor. A viewer, and any other role, only looks. */
export function canWrite(role: string): boolean {
  return role === "admin" || role === "editor";
}
