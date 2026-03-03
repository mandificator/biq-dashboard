import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://app.biq.me/api/v0/events";
const AUTH_TOKEN = "Bearer r0b0_analytics";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const organizerId = searchParams.get("organizerId");

  const params = new URLSearchParams();
  if (organizerId) params.append("organizerId", organizerId);

  const url = params.toString() ? `${API_BASE}?${params.toString()}` : API_BASE;

  try {
    const res = await fetch(url, {
      headers: { Authorization: AUTH_TOKEN },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
