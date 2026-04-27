import { startOfUtcDay } from "@/lib/sports/wag-rotation";

/// Deterministic sponsor rotation. Hashes today's UTC date and picks
/// from the active set, so all viewers see the same brand all day —
/// the rotation advances at UTC midnight. Pure function, testable in
/// isolation.
///
/// Returns null when the active set is empty (page renders no sponsor
/// surfaces at all). Otherwise returns the picked entity plus its
/// 0-based index within `sponsors` so the caller can highlight the
/// matching dot in the rotation indicator.
export function pickSponsorForToday<T>(
  sponsors: readonly T[],
  date: Date = startOfUtcDay(),
): { sponsor: T; index: number } | null {
  if (sponsors.length === 0) return null;
  const index = hashUtcDay(date) % sponsors.length;
  return { sponsor: sponsors[index], index };
}

/// 32-bit djb2-style hash of the UTC midnight ISO string. Stable across
/// processes — same date in produces same number out, regardless of
/// runtime, locale, or time zone of the calling process. Exported so
/// callers can derive day-keyed pseudo-random values for other features
/// (highlight ordering, etc.) without re-implementing.
export function hashUtcDay(date: Date = startOfUtcDay()): number {
  return djb2(date.toISOString());
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
