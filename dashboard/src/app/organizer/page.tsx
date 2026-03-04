"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  EventListItem,
  OrganizerInfo,
  AnalyticsResponse,
} from "@/types";

export default function OrganizerIndex() {
  const router = useRouter();
  const [orgList, setOrgList] = useState<OrganizerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/events");
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        const events: EventListItem[] = Array.isArray(data) ? data : data.events || [];

        // Discover unique org IDs
        const orgIdSet = new Set<string>();
        const orgFirstEvent: Record<string, string> = {};
        for (const ev of events) {
          for (const oid of ev.organizerId || []) {
            if (!orgIdSet.has(oid)) {
              orgIdSet.add(oid);
              orgFirstEvent[oid] = ev.id;
            }
          }
        }
        const orgIds = Array.from(orgIdSet);

        // If only one org, redirect immediately
        if (orgIds.length === 1) {
          router.replace(`/organizer/${orgIds[0]}`);
          return;
        }

        if (orgIds.length === 0) {
          setLoading(false);
          return;
        }

        // Fetch org info from analytics
        const infoMap: Record<string, OrganizerInfo> = {};
        const uniqueEventIds = [...new Set(Object.values(orgFirstEvent))];
        await Promise.allSettled(
          uniqueEventIds.map((eventId) =>
            fetch(`/api/analytics?eventId=${eventId}`)
              .then((r) => r.ok ? r.json() : null)
              .then((aData: (AnalyticsResponse & { organizers?: Record<string, OrganizerInfo> }) | null) => {
                if (aData?.organizers) {
                  for (const [id, info] of Object.entries(aData.organizers)) {
                    if (!infoMap[id]) infoMap[id] = { ...info, id };
                  }
                }
              })
          )
        );

        // Build list with fallbacks
        const list = orgIds.map((oid) => infoMap[oid] || { id: oid, name: oid, logo: "", description: "" });
        setOrgList(list);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--bg-texture)" }}>
      <header
        className="flex-shrink-0 flex items-center px-5 h-[52px]"
        style={{
          background: "linear-gradient(180deg, #2e2e34 0%, #242428 60%, #202024 100%)",
          borderBottom: "1px solid rgba(0,0,0,0.5)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <span className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
          Select Organizer
        </span>
      </header>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      )}

      {error && (
        <div className="skeuo-panel p-3 text-[11px] m-3" style={{ color: "var(--red)" }}>{error}</div>
      )}

      {!loading && !error && orgList.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: "var(--text-tertiary)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span className="text-[13px]">No organizers found</span>
        </div>
      )}

      {!loading && !error && orgList.length > 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", maxWidth: 720, width: "100%" }}>
            {orgList.map((org) => (
              <button
                key={org.id}
                onClick={() => router.push(`/organizer/${org.id}`)}
                className="skeuo-panel p-4 flex items-center gap-3 text-left transition-all hover:scale-[1.02]"
                style={{ cursor: "pointer" }}
              >
                {org.logo ? (
                  <img src={org.logo} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.06)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[12px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{org.name}</div>
                  {org.description && (
                    <div className="text-[10px] truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>{org.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
