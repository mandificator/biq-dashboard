import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://app.biq.me/api/v0/analytics";
const AUTH_TOKEN = `Bearer ${process.env.BIQ_API_TOKEN ?? ""}`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  const since = searchParams.get("since");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const params = new URLSearchParams({ eventId });
  if (since) params.append("since", since);

  try {
    // Incremental refreshes (?since=) must stay fresh; full fetches can be
    // briefly cached server-side and at the CDN.
    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      headers: { Authorization: AUTH_TOKEN },
      ...(since ? { cache: "no-store" as const } : { next: { revalidate: 30 } }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": since
          ? "no-store"
          : "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
