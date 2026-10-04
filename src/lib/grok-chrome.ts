/**
 * Grok page chrome (the grok.com script and share-tag rewriting).
 * "off" disables it. Anything else, including unset, leaves the workspace preview as it is.
 */
export function grokChromeEnabled(value: string | undefined): boolean {
  return (value ?? "").trim().toLowerCase() !== "off";
}
