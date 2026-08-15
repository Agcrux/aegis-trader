import { cookies } from "next/headers";
import {
  deserializeSandbox,
  newSandbox,
  serializeSandbox,
  type PaperSandbox,
} from "./sandbox";

/**
 * Cookie persistence for the tester sandbox. The user chose browser-only
 * storage that survives a refresh, so the whole portfolio rides in one
 * HttpOnly cookie: server components read it while rendering, and only route
 * handlers write it (Next forbids setting cookies during a render).
 */

const COOKIE = "aegis_paper";
const MAX_AGE_S = 60 * 60 * 24 * 365;

export async function readSandbox(): Promise<PaperSandbox | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  return deserializeSandbox(raw);
}

/** A readable sandbox for rendering; an unsaved fresh one when nothing exists. */
export async function readSandboxOrFresh(): Promise<PaperSandbox> {
  return (await readSandbox()) ?? newSandbox();
}

export async function writeSandbox(sb: PaperSandbox): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, serializeSandbox(sb), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function clearSandbox(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
