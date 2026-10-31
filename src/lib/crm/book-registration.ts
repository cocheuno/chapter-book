/** True only when the host set BOOK_REGISTRATION to "on". */
export function bookRegistrationAllowed(value: string | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "on";
}

/** One gate for the register page, consent, and pay links. */
export function registrationOpen(input: {
  flag: string | undefined;
  spamMode: "skip" | "verify" | "misconfigured";
  eventSwitch: boolean;
}): boolean {
  return bookRegistrationAllowed(input.flag) && input.spamMode !== "misconfigured" && input.eventSwitch === true;
}
