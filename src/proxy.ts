import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Protects the app pages. In demo mode (no DATABASE_URL) pages are viewable
 * read-only; with a database connected, a valid session cookie is required.
 * API routes enforce their own auth and are excluded here.
 */
export async function proxy(req: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.next();

  const token = req.cookies.get("aegis_session")?.value;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
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
