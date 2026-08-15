/**
 * The HMAC key behind the session cookie, shared by the auth helpers and the
 * route proxy so both accept exactly the same tokens.
 *
 * AUTH_SECRET is the source of truth. When it is missing the key is derived
 * from DATABASE_URL — itself a server-only secret — so the tester sandbox still
 * works on a deployment that hasn't set AUTH_SECRET yet. Owner sign-in refuses
 * to run on a derived key (see createSession): owner sessions unlock real
 * account controls and must rest on a dedicated secret.
 */

const DEV_FALLBACK = "aegis-trader-local-development-session-key";

export function rawSessionSecret(): string {
  const explicit = (process.env.AUTH_SECRET ?? "").trim();
  if (explicit.length >= 16) return explicit;
  const db = (process.env.DATABASE_URL ?? "").trim();
  if (db.length >= 16) return `derived-from-database-url:${db}`;
  return process.env.NODE_ENV === "production" ? "" : DEV_FALLBACK;
}

/** True when AUTH_SECRET itself is configured, which owner sessions require. */
export function hasOwnerSecret(): boolean {
  return (process.env.AUTH_SECRET ?? "").trim().length >= 16;
}

/** HS256 needs a 256-bit key; hashing accepts any secret length without weakening it. */
export async function sessionKey(): Promise<Uint8Array> {
  const raw = rawSessionSecret();
  if (!raw) {
    throw new Error("AUTH_SECRET is not configured (needs a long random string)");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return new Uint8Array(digest);
}
