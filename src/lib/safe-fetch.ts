import "server-only";
import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";

// SSRF-safe outbound fetch. Every place we fetch a URL on behalf of a user
// (ingest adapter pastes, copyRemoteToR2 thumbnails) must funnel through
// this helper — security-sentinel's P0 finding was that `redirect: "follow"`
// + no private-IP guard let a pasted URL pivot to internal network from
// the Railway container (AWS metadata at 169.254.169.254, Railway internal
// 10.x, localhost, etc).
//
// What this guards against:
//   - literal IP URLs in private / loopback / link-local / IPv6-ULA blocks
//   - hostnames that resolve to any of the above
//   - redirect chains that start on a public host and hop to an internal one
//     (we follow redirects MANUALLY and re-validate every hop)
//   - named internal services (cloud metadata endpoints)
//
// What this does NOT guard against (documented gaps):
//   - DNS rebinding between our lookup() and fetch()'s resolver call. At
//     7-user private-app scale we accept the TOCTOU window; pinning via
//     Happy Eyeballs + custom agent is future work.
//   - Response-body DoS: if a server streams forever, the per-call timeout
//     is the only bound. Callers should still cap bytes after reading.

const PRIVATE_BLOCKS = new BlockList();
PRIVATE_BLOCKS.addSubnet("10.0.0.0", 8);
PRIVATE_BLOCKS.addSubnet("127.0.0.0", 8);
PRIVATE_BLOCKS.addSubnet("172.16.0.0", 12);
PRIVATE_BLOCKS.addSubnet("192.168.0.0", 16);
PRIVATE_BLOCKS.addSubnet("169.254.0.0", 16);
PRIVATE_BLOCKS.addSubnet("0.0.0.0", 8);
PRIVATE_BLOCKS.addSubnet("::1", 128, "ipv6");
PRIVATE_BLOCKS.addSubnet("fc00::", 7, "ipv6");
PRIVATE_BLOCKS.addSubnet("fe80::", 10, "ipv6");

const BLOCKED_HOSTS = new Set<string>([
  "metadata.google.internal",
  "metadata.google.com",
  "metadata.aws",
  "instance-data.aws",
  "metadata.azure.com",
  "metadata",
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
]);

const MAX_REDIRECTS = 3;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export type SafeFetchOptions = {
  timeoutMs: number;
  accept: string;
  userAgent: string;
};

/**
 * Fetch an untrusted URL safely. Rejects private / loopback / link-local /
 * cloud-metadata addresses before issuing a request, and re-validates on
 * every redirect hop. Returns the final successful Response; throws
 * UnsafeUrlError for any blocked / unresolvable / redirect-loop / non-2xx.
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    let currentUrl = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const parsed = parseUrl(currentUrl);
      await assertUrlSafe(parsed);

      const res = await fetch(currentUrl, {
        headers: { "User-Agent": opts.userAgent, Accept: opts.accept },
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });

      // Manual redirect follow — the whole point. fetch's automatic follow
      // would let an initially-public host 302 to 169.254.169.254 and we'd
      // never see it.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          throw new UnsafeUrlError(
            `Redirect from ${parsed.hostname} with no Location header`,
          );
        }
        if (hop >= MAX_REDIRECTS) {
          throw new UnsafeUrlError("Too many redirects");
        }
        // Relative locations resolve against the previous URL.
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!res.ok) {
        throw new UnsafeUrlError(`Upstream returned ${res.status}`);
      }
      return res;
    }
    throw new UnsafeUrlError("Redirect loop");
  } finally {
    clearTimeout(timer);
  }
}

function parseUrl(raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${raw.slice(0, 80)}`);
  }
}

/// URL-only safety check, exported so callers that need to use plain
/// `fetch()` (e.g. feed polling, where safeFetch's manual-redirect
/// wrapper interacted badly with one CDN's response shape) can still
/// pre-flight-validate the URL against the SSRF guard. Doesn't follow
/// redirects — caller is responsible for that.
export async function assertUrlSafePublic(rawUrl: string): Promise<URL> {
  const parsed = parseUrl(rawUrl);
  await assertUrlSafe(parsed);
  return parsed;
}

async function assertUrlSafe(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError(`Unsupported protocol: ${url.protocol}`);
  }

  // URL.hostname strips IPv6 brackets, so "[::1]" becomes "::1" here.
  const hostname = url.hostname.toLowerCase();

  if (!hostname) {
    throw new UnsafeUrlError("Empty hostname");
  }
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new UnsafeUrlError(`Host "${hostname}" is blocked`);
  }

  // Literal IP? Check directly without resolving.
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    if (PRIVATE_BLOCKS.check(hostname, "ipv4")) {
      throw new UnsafeUrlError(
        `Host "${hostname}" is a private IPv4 address`,
      );
    }
    return;
  }
  if (ipVersion === 6) {
    if (PRIVATE_BLOCKS.check(hostname, "ipv6")) {
      throw new UnsafeUrlError(
        `Host "${hostname}" is a private IPv6 address`,
      );
    }
    return;
  }

  // Real hostname — resolve + check against the blocklist.
  let resolved: { address: string; family: number };
  try {
    resolved = await lookup(hostname);
  } catch {
    throw new UnsafeUrlError(`Could not resolve "${hostname}"`);
  }
  const familyKey = resolved.family === 4 ? "ipv4" : "ipv6";
  if (PRIVATE_BLOCKS.check(resolved.address, familyKey)) {
    throw new UnsafeUrlError(
      `Host "${hostname}" resolved to private address ${resolved.address}`,
    );
  }
}
