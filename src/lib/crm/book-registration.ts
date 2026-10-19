/** True only when the host set BOOK_REGISTRATION to "on". */
export function bookRegistrationAllowed(value: string | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "on";
}
