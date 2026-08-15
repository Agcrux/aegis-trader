import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { sessionKey } from "./lib/session-secret";

/**
 * Protects the app pages. In demo mode (no DATABASE_URL) pages are viewable
 * read-only; with a database connected, a valid session cookie is required —
 * owner or tester. Pages themselves decide what each role may see.
 * API routes enforce their own auth and are excluded here.
 */
export async function proxy(req: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.next();

  const token = req.cookies.get("aegis_session")?.value;
  if (token) {
    try {
      await jwtVerify(token, await sessionKey());
      return NextResponse.next();
    } catch {
      // fall through to redirect
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/journal/:path*", "/performance/:path*", "/system/:path*", "/lab/:path*"],
};
