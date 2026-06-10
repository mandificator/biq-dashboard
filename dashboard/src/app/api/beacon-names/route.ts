import { NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

/**
 * Shared beacon-name store (one JSON map keyed by beaconId) backed by
 * Vercel Blob, so renames sync across devices and browsers.
 * Clients keep a localStorage copy as an offline fallback.
 */
const BLOB_KEY = "beacon-names.json";

async function readNames(): Promise<Record<string, string>> {
  const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
  if (blobs.length === 0) return {};
  const res = await fetch(blobs[0].url, { cache: "no-store" });
  if (!res.ok) return {};
  const data = await res.json();
  return data && typeof data === "object" ? data : {};
}

export async function GET() {
  try {
    const names = await readNames();
    return NextResponse.json(names, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Blob store not configured or unreachable — clients fall back to localStorage
    return NextResponse.json({}, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  let names: Record<string, string>;
  try {
    const body = await request.json();
    names = body?.names;
    if (!names || typeof names !== "object" || Array.isArray(names)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Body must be { names: { [beaconId]: name } }" }, { status: 400 });
  }

  // Keep entries sane
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(names)) {
    if (typeof k === "string" && typeof v === "string" && k.length <= 100 && v.trim().length > 0) {
      clean[k] = v.trim().slice(0, 60);
    }
  }
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: "No valid entries" }, { status: 400 });
  }

  try {
    const current = await readNames();
    const merged = { ...current, ...clean };
    await put(BLOB_KEY, JSON.stringify(merged), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return NextResponse.json(merged);
  } catch {
    return NextResponse.json({ error: "Failed to save names" }, { status: 500 });
  }
}
