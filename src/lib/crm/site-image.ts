/** Uploaded shelf pictures. Callers pass file bytes; this module never fetches a remote address. */

export const MAX_SITE_IMAGE_BYTES = 1_500_000;

const IMAGE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SiteImageMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export function siteImageSrc(id: string | null | undefined): string | null {
  const value = id?.trim() ?? "";
  if (!IMAGE_ID.test(value)) return null;
  return `/api/site-image/${value}`;
}

export function sniffSiteImage(bytes: Uint8Array): SiteImageMime | null {
  if (bytes.length < 12 || bytes.length > MAX_SITE_IMAGE_BYTES) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return "image/gif";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** pg returns a Buffer; PGLite may return Uint8Array or a hex bytea string. */
export function siteImageBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (typeof value !== "string" || !value.startsWith("\\x") || value.length < 4) return null;
  const hex = value.slice(2);
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
