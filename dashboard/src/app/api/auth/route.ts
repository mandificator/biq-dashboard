import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side password check — the password lives in the DASHBOARD_PASSWORD
 * env var and never ships in the client bundle.
 */
export async function POST(request: NextRequest) {
  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Auth not configured" }, { status: 500 });
  }

  if (password === expected) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}
