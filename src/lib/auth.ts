import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "./config";
import type { SessionUser } from "./types";

/**
 * Minimal, dependency-light session auth for exactly two owner users.
 * Signed HttpOnly JWT cookie (30 days), HS256 via AUTH_SECRET.
 */

const COOKIE = "aegis_session";
const MAX_AGE_S = 60 * 60 * 24 * 30;

function secretKey(): Uint8Array {
  const secret = env.authSecret();
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is not configured (needs a long random string)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secretKey());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      id: String(payload.sub),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}

/** Route-handler guard: returns the user or throws a 401 Response. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return user;
}
