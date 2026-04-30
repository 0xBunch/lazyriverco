// HTTP/HTTPS URL sanitization helpers. Originally lived inline in
// src/lib/player-partner.ts; extracted so the SportsWag write path
// (admin form actions + auto-fill server action) can apply the same
// guarantees as PlayerPartnerInfo writes.

/// Whitelist used by the WAGFINDER pipeline when it surfaces a
/// "source" link on a partner card. Matched by eTLD+1 suffix so
/// subdomains pass. Reused for the SportsWag source link planned in
/// Track B.
export const SOURCE_DOMAIN_WHITELIST: readonly string[] = [
  "wikipedia.org",
  "wikimedia.org",
  "espn.com",
  "nfl.com",
  "si.com",
  "sportsillustrated.com",
  "yahoo.com",
  "nytimes.com",
  "washingtonpost.com",
  "theathletic.com",
  "people.com",
  "usatoday.com",
  "foxsports.com",
  "cbssports.com",
  "bleacherreport.com",
  "usmagazine.com",
];

/// Returns the canonical URL string only if `raw` is an http/https URL,
/// has no userinfo (a phishing vector — e.g. `https://user:pass@evil.com`),
/// and lives on the source-domain whitelist. Returns null otherwise.
export function sanitizeSourceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    if (raw.length > 512) return null;
    const host = u.hostname.toLowerCase();
    const onList = SOURCE_DOMAIN_WHITELIST.some(
      (d) => host === d || host.endsWith("." + d),
    );
    if (!onList) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/// HTTPS-only image URL. Requires a real image file extension on the
/// path so HTML pages (or HTML pages wrapped in a hot-link tracker URL)
/// don't slip through. Query strings after the extension are fine.
export function sanitizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (raw.length > 2048) return null;
    const path = u.pathname.toLowerCase();
    if (!/\.(jpe?g|png|webp|gif|avif)(\?|$)/.test(path)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/// Loose image URL — http(s), no userinfo, length cap. No extension
/// check. Used by the SportsWag admin form, which historically allowed
/// any http(s) URL on the assumption that the proxy handles content-
/// type validation at fetch time. Strict callers should prefer
/// sanitizeImageUrl above.
export function sanitizeLooseImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    if (raw.length > 2048) return null;
    return u.toString();
  } catch {
    return null;
  }
}
