import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { hasOwnerSecret, sessionKey } from "./session-secret";
import type { SessionRole, SessionUser } from "./types";

/**
 * Minimal, dependency-light session auth for exactly two owner users plus
 * throwaway tester sandboxes. Signed HttpOnly JWT cookie (30 days), HS256.
 *
 * The role claim decides what a session may touch: OWNER reaches real accounts
 * and the engine, TESTER only reaches its own cookie-stored play money.
 */

const COOKIE = "aegis_session";
const MAX_AGE_S = 60 * 60 * 24 * 30;

export async function createSession(user: SessionUser): Promise<void> {
  if (user.role === "OWNER" && !hasOwnerSecret()) {
    throw new Error(
      "AUTH_SECRET must be set before owners can sign in (a long random string; see docs/SETUP.md)"
    );
  }
  const token = await new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(await sessionKey());
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
    const { payload } = await jwtVerify(token, await sessionKey());
    if (!payload.sub) return null;
    const role: SessionRole = payload.role === "TESTER" ? "TESTER" : "OWNER";
    // An owner token can only be trusted while AUTH_SECRET backs it.
    if (role === "OWNER" && !hasOwnerSecret()) return null;
    return {
      id: String(payload.sub),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role,
    };
  } catch {
    return null;
  }
}

function unauthorized(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Route-handler guard: returns the user or throws a 401 Response. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw unauthorized("Not signed in", 401);
  return user;
}

/** Route-handler guard for anything that touches real accounts or the engine. */
export async function requireOwner(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== "OWNER") {
    throw unauthorized(
      "Tester sandboxes can't touch real accounts or the engine. Everything you trade lives in your own browser.",
      403
    );
  }
  return user;
}

/** Route-handler guard for the paper sandbox endpoints. */
export async function requireTester(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== "TESTER") {
    throw unauthorized(
      "The paper sandbox belongs to tester sessions. Owner accounts trade through the engine instead.",
      403
    );
  }
  return user;
}
