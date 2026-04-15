// Session cookie helpers using Web Crypto (HMAC-SHA256).
// Runs identically in Edge Runtime (middleware) and Node runtime (route handlers).

export const SESSION_COOKIE_NAME = "lr-session";
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_MAX_AGE_MS / 1000);

export type SessionPayload = {
  userId: string;
  epoch: number;
  issuedAt: number;
};

const encoder = new TextEncoder();

function base64UrlEncode(bytes: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "====".slice(padded.length % 4);
  const b64 = padded + pad;
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return secret;
}

function serializePayload(p: SessionPayload): string {
  return `${p.userId}.${p.epoch}.${p.issuedAt}`;
}

export async function signToken(payload: SessionPayload): Promise<string> {
  const key = await importKey(getSecret());
  const data = serializePayload(payload);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return `${data}.${base64UrlEncode(sig)}`;
}

export async function verifyToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 4) return null;
    const [userId, epochStr, issuedAtStr, sigB64] = parts;
    const epoch = Number(epochStr);
    const issuedAt = Number(issuedAtStr);
    if (!userId || !Number.isFinite(epoch) || !Number.isFinite(issuedAt)) {
      return null;
    }
    if (Date.now() - issuedAt > SESSION_MAX_AGE_MS || issuedAt > Date.now()) {
      return null;
    }
    const data = `${userId}.${epoch}.${issuedAt}`;
    const key = await importKey(getSecret());
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(sigB64),
      encoder.encode(data),
    );
    return ok ? { userId, epoch, issuedAt } : null;
  } catch (e) {
    // Genuine config errors (e.g. missing SESSION_SECRET) should surface as 500,
    // not silently look like "everyone's logged out". Malformed-token errors
    // (bad base64, etc.) are swallowed and return null.
    if (e instanceof Error && e.message === "SESSION_SECRET is not set") {
      throw e;
    }
    return null;
  }
}

export function buildSessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildClearCookie(): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}
