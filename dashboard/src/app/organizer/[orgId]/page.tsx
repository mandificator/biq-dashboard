"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import {
  EventListItem,
  OrganizerInfo,
  AnalyticsResponse,
  ProcessedData,
  CrossEventAnalysis,
} from "@/types";
import { processAnalytics } from "@/lib/processData";
import { analyzeCrossEvents } from "@/lib/crossEventAnalysis";
import EventCard from "@/components/organizer/EventCard";
import LiveDashboard from "@/components/organizer/LiveDashboard";

const EVENT_COLORS = ["#0095FF", "#00D4F5", "#F7941D", "#8CC63F", "#7B5EA7"];

function formatDur(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function OrganizerDashboard() {
  const params = useParams();
  const orgId = params.orgId as string;

  const savedEventIds = typeof window !== "undefined" ? sessionStorage.getItem(`biq-org-${orgId}-selectedEvents`) : null;

  const [orgEvents, setOrgEvents] = useState<EventListItem[]>([]);
  const [orgInfo, setOrgInfo] = useState<OrganizerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Event analytics
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(() => {
    if (savedEventIds) try { return new Set(JSON.parse(savedEventIds)); } catch { /* ignore */ }
    return new Set();
  });
  const [loadedData, setLoadedData] = useState<Map<string, ProcessedData>>(new Map());
  const [loadingEventIds, setLoadingEventIds] = useState<Set<string>>(new Set());

  // Refs for stable fetch deduplication
  const loadedRef = useRef(loadedData);
  loadedRef.current = loadedData;
  const loadingRef = useRef(loadingEventIds);
  loadingRef.current = loadingEventIds;

  // ── Fetch events for this organizer ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/events?organizerId=${encodeURIComponent(orgId)}`);
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        const events: EventListItem[] = Array.isArray(data) ? data : data.events || [];
        const sorted = events.sort((a, b) => b.startTime - a.startTime);
        setOrgEvents(sorted);

        // Fetch org info from the first event's analytics
        if (sorted.length > 0) {
          const aRes = await fetch(`/api/analytics?eventId=${sorted[0].id}`);
          if (aRes.ok) {
            const aData = await aRes.json() as AnalyticsResponse & { organizers?: Record<string, OrganizerInfo> };
            if (aData.organizers?.[orgId]) {
              setOrgInfo({ ...aData.organizers[orgId], id: orgId });
            }
            // Also cache this first event's processed data
            setLoadedData((prev) => new Map(prev).set(sorted[0].id, processAnalytics(aData)));
          }
        }

        if (!events.some((ev) => ev.organizerId?.includes(orgId))) {
          // No events for this org — might be invalid orgId
          setOrgInfo({ id: orgId, name: orgId, logo: "", description: "" });
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load events");
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  const eventNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ev of orgEvents) map[ev.id] = ev.name;
    return map;
  }, [orgEvents]);

  const eventDates = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of orgEvents) map[ev.id] = ev.startTime;
    return map;
  }, [orgEvents]);

  // ── Persist selections to sessionStorage ──
  useEffect(() => {
    sessionStorage.setItem(`biq-org-${orgId}-selectedEvents`, JSON.stringify(Array.from(selectedEventIds)));
  }, [selectedEventIds, orgId]);

  // ── Fetch analytics — stable callback using refs ──
  const fetchEventAnalytics = useCallback((eventId: string) => {
    if (loadedRef.current.has(eventId) || loadingRef.current.has(eventId)) return;
    setLoadingEventIds((ls) => new Set(ls).add(eventId));
    fetch(`/api/analytics?eventId=${eventId}`)
      .then((res) => res.json())
      .then((data: AnalyticsResponse) => {
        setLoadedData((prev) => new Map(prev).set(eventId, processAnalytics(data)));
      })
      .catch((err) => console.error("Failed to load analytics for", eventId, err))
      .finally(() => {
        setLoadingEventIds((ls) => { const n = new Set(ls); n.delete(eventId); return n; });
      });
  }, []);

  // ── Re-fetch analytics for restored selections ──
  useEffect(() => {
    if (orgEvents.length === 0 || selectedEventIds.size === 0) return;
    const validIds = new Set(orgEvents.map((e) => e.id));
    for (const eid of selectedEventIds) {
      if (validIds.has(eid)) fetchEventAnalytics(eid);
    }
    setSelectedEventIds((prev) => {
      const cleaned = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      if (cleaned.size !== prev.size) return cleaned;
      return prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgEvents]);

  const toggleEvent = useCallback((eventId: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) { next.delete(eventId); } else { next.add(eventId); fetchEventAnalytics(eventId); }
      return next;
    });
  }, [fetchEventAnalytics]);

  const selectAll = useCallback(() => {
    const ids = new Set(orgEvents.map((e) => e.id));
    setSelectedEventIds(ids);
    for (const eid of ids) fetchEventAnalytics(eid);
  }, [orgEvents, fetchEventAnalytics]);

  const deselectAll = useCallback(() => { setSelectedEventIds(new Set()); }, []);

  // ── Cross-event analysis ──
  const crossAnalysis = useMemo<CrossEventAnalysis | null>(() => {
    const datasets = Array.from(selectedEventIds)
      .filter((eid) => loadedData.has(eid))
      .map((eid) => ({ eventId: eid, data: loadedData.get(eid)! }));
    if (datasets.length < 2) return null;
    return analyzeCrossEvents(datasets);
  }, [selectedEventIds, loadedData]);

  // ── Aggregate stats ──
  const aggStats = useMemo(() => {
    const datasets = Array.from(selectedEventIds)
      .map((eid) => loadedData.get(eid))
      .filter(Boolean) as ProcessedData[];
    if (datasets.length === 0) return null;
    const allUserIds = new Set<string>();
    let totalDwell = 0, totalProofs = 0, userCount = 0;
    for (const d of datasets) {
      for (const u of d.userDetails) { allUserIds.add(u.userId); totalDwell += u.dwellMinutes; userCount++; }
      totalProofs += d.proofs.length;
    }
    return { uniqueUsers: allUserIds.size, avgDwell: userCount > 0 ? Math.round(totalDwell / userCount) : 0, totalProofs };
  }, [selectedEventIds, loadedData]);

  const selectedCount = selectedEventIds.size;
  const loadedCount = Array.from(selectedEventIds).filter((eid) => loadedData.has(eid)).length;

  // Event color map
  const eventColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    orgEvents.forEach((ev, i) => { m[ev.id] = EVENT_COLORS[i % EVENT_COLORS.length]; });
    return m;
  }, [orgEvents]);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--bg-texture)" }}>
      {/* ── Header ── */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-5 h-[52px]"
        style={{
          background: "linear-gradient(180deg, #2e2e34 0%, #242428 60%, #202024 100%)",
          borderBottom: "1px solid rgba(0,0,0,0.5)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-3">
          {orgInfo && (
            <div className="flex items-center gap-2 ml-1">
              <div className="w-px h-4" style={{ background: "rgba(255,255,255,0.08)" }} />
              {orgInfo.logo && (
                <img src={orgInfo.logo} alt="" className="w-6 h-6 rounded-md object-cover"
                  style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
              )}
              <span className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
                {orgInfo.name}
              </span>
            </div>
          )}
        </div>

        {/* Stats in header */}
        {aggStats && (
          <div className="flex items-center gap-4">
            <HeaderStat label="Selected" value={loadedCount} color="#00D4F5" />
            <HeaderStat label="Users" value={aggStats.uniqueUsers} color="#0095FF" />
            <HeaderStat label="Dwell" value={formatDur(aggStats.avgDwell)} color="#8CC63F" />
            <HeaderStat label="Proofs" value={aggStats.totalProofs.toLocaleString()} color="#F7941D" />
          </div>
        )}

        <div className="flex items-center gap-2">
          {loading && (
            <div className="w-3 h-3 rounded-full animate-spin" style={{ border: "2px solid var(--accent)", borderTopColor: "transparent" }} />
          )}
        </div>
      </header>

      {/* ── Loading / Error / Empty ── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      )}
      {error && (
        <div className="skeuo-panel p-3 text-[11px] m-3" style={{ color: "var(--red)" }}>{error}</div>
      )}
      {!loading && !error && orgEvents.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: "var(--text-tertiary)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span className="text-[13px]">No events found for this organizer</span>
        </div>
      )}

      {/* ── Main: sidebar + dashboard ── */}
      {!loading && !error && orgEvents.length > 0 && (
        <div className="flex-1 min-h-0 flex gap-3 p-3">
          {/* ── Left sidebar: event list ── */}
          <div className="w-[260px] flex-shrink-0 flex flex-col skeuo-panel overflow-hidden">
            {/* Select all / clear */}
            <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-[9px] font-bold uppercase tracking-wider flex-1" style={{ color: "var(--text-tertiary)" }}>
                Events ({orgEvents.length})
              </span>
              <button onClick={selectedCount === orgEvents.length && selectedCount > 0 ? deselectAll : selectAll}
                className="text-[8px] font-bold px-1.5 py-0.5 rounded skeuo-btn"
                style={{ color: "var(--text-secondary)" }}>
                {selectedCount === orgEvents.length && selectedCount > 0 ? "None" : "All"}
              </button>
              {selectedCount > 0 && selectedCount !== orgEvents.length && (
                <button onClick={deselectAll}
                  className="text-[8px] font-bold px-1.5 py-0.5 rounded skeuo-btn"
                  style={{ color: "var(--text-tertiary)" }}>
                  Clear
                </button>
              )}
            </div>

            {/* Event list */}
            <div className="flex-1 min-h-0 overflow-auto px-1.5 py-1">
              <div className="flex flex-col gap-0.5">
                {orgEvents.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    selected={selectedEventIds.has(ev.id)}
                    onToggle={toggleEvent}
                    data={loadedData.get(ev.id) || null}
                    loading={loadingEventIds.has(ev.id)}
                    color={eventColorMap[ev.id] || "#666"}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: live dashboard ── */}
          <div className="flex-1 min-w-0 min-h-0">
            {crossAnalysis ? (
              <LiveDashboard
                analysis={crossAnalysis}
                loadedData={loadedData}
                eventNames={eventNames}
                eventDates={eventDates}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "var(--text-tertiary)" }}>
                {selectedCount === 0 ? (
                  <>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <span className="text-[12px]">Select events to see analytics</span>
                    <span className="text-[9px]" style={{ color: "var(--text-tertiary)", opacity: 0.6 }}>
                      Pick 2 or more from the sidebar
                    </span>
                  </>
                ) : loadedCount < 2 ? (
                  <>
                    <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
                    <span className="text-[11px]">
                      {loadedCount === 0 ? "Loading event data..." : "Select one more event to compare"}
                    </span>
                  </>
                ) : (
                  <>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    <span className="text-[11px]">Select one more event to compare</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[9px] font-bold uppercase" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
