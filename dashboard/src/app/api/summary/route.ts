import { NextRequest, NextResponse } from "next/server";
import { buildEventSummary } from "@/lib/summary";

const API_BASE = "https://app.biq.me/api/v0/analytics";
const AUTH_TOKEN = "Bearer r0b0_analytics";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_BASE}?eventId=${encodeURIComponent(eventId)}`, {
      headers: { Authorization: AUTH_TOKEN },
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const summary = buildEventSummary(data);

    // Past events never change — cache them aggressively at the CDN.
    const endedAgo = Math.floor(Date.now() / 1000) - summary.event.endTime;
    const cacheControl = endedAgo > 24 * 3600
      ? "public, s-maxage=3600, stale-while-revalidate=86400"
      : "public, s-maxage=30, stale-while-revalidate=120";

    return NextResponse.json(summary, {
      headers: { "Cache-Control": cacheControl },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to build summary" },
      { status: 500 }
    );
  }
}
