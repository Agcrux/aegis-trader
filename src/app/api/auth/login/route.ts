import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ensureSchema, getSql } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(
      { error: "Demo mode: connect a database to enable sign-in." },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  if (!body?.email || !body.password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT id, email, name, password_hash FROM users
    WHERE email = ${body.email.trim().toLowerCase()}`) as Array<{
    id: string;
    email: string;
    name: string;
    password_hash: string;
  }>;
  const user = rows[0];
  const ok = user ? await bcrypt.compare(body.password, user.password_hash) : false;
  if (!ok) {
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }
  await createSession({ id: user.id, email: user.email, name: user.name, role: "OWNER" });
  return NextResponse.json({ ok: true });
}
