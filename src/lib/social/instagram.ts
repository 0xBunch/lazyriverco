// Instagram handle utilities shared by PlayerPartnerInfo (Sleeper player
// profiles) and SportsWag (cross-sport editorial roster). One validator
// guarantees both surfaces store the same shape: 1-30 lowercase letters,
// digits, underscores, and periods, with the leading/trailing/consecutive
// dot edge cases Instagram itself rejects also disallowed.

/// Normalize free-form input into a canonical Instagram handle, or null
/// if the input doesn't look like one. Accepts both bare handles
/// ("brittanymahomes") and URLs ("https://instagram.com/brittanymahomes/")
/// so admin paste-from-browser works.
export function sanitizeInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = extractFromUrl(trimmed) ?? trimmed;
  const handle = candidate.replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9_.]{1,30}$/.test(handle)) return null;
  if (/^[.]+$/.test(handle)) return null;
  if (handle.startsWith(".") || handle.endsWith(".")) return null;
  if (handle.includes("..")) return null;
  return handle;
}

/// Render-side helper. `null` if the handle isn't useful for a link.
export function instagramHandleUrl(handle: string | null | undefined): string | null {
  const sanitized = sanitizeInstagramHandle(handle ?? null);
  return sanitized ? `https://instagram.com/${sanitized}` : null;
}

function extractFromUrl(raw: string): string | null {
  // Match instagram.com/<handle> with optional protocol, www subdomain,
  // and trailing slash/query/segments. Anchored start; consumes only
  // the first path segment so we ignore /reel/abc, /p/abc, etc.
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i);
  return m ? m[1] : null;
}
