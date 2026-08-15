import { NextResponse } from "next/server";
import { getHealth } from "@/lib/store";

export async function GET() {
  const health = await getHealth();
  return NextResponse.json(health);
}
