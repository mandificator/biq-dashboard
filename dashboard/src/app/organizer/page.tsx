"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

export default function OrganizerPage() {
  // Restore saved state from sessionStorage
  const savedOrgId = typeof window !== "undefined" ? sessionStorage.getItem("biq-org-selectedOrg") : null;
  const savedEventIds = typeof window !== "undefined" ? sessionStorage.getItem("biq-org-selectedEvents") : null;

  // All events cached from initial fetch
  const [allEvents, setAllEvents] = useState<EventListItem[]>([]);

  // Org discovery
  const [allOrgIds, setAllOrgIds] = useState<string[]>([]);
  const [orgInfoMap, setOrgInfoMap] = useState<Record<string, OrganizerInfo>>({});
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(savedOrgId);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

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

  // ── Derive org events locally (no Phase 2 fetch) ──
  const orgEvents = useMemo(() => {
    if (!selectedOrgId || allEvents.length === 0) return [];
    return allEvents
      .filter((ev) => ev.organizerId?.includes(selectedOrgId))
      .sort((a, b) => b.startTime - a.startTime);
  }, [allEvents, selectedOrgId]);

  // ── Phase 1: discover organizers — parallel analytics fetches ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/events");
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        const events: EventListItem[] = Array.isArray(data) ? data : data.events || [];
        setAllEvents(events);

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
        setAllOrgIds(orgIds);

        // Fetch org info in parallel
        const infoMap: Record<string, OrganizerInfo> = {};
        const uniqueEventIds = [...new Set(Object.values(orgFirstEvent))];
        const results = await Promise.allSettled(
          uniqueEventIds.map((eventId) =>
            fetch(`/api/analytics?eventId=${eventId}`)
              .then((r) => r.ok ? r.json() : null)
              .then((aData: (AnalyticsResponse & { organizers?: Record<string, OrganizerInfo> }) | null) => {
                if (!aData) return;
                if (aData.organizers) {
                  for (const [id, info] of Object.entries(aData.organizers)) {
                    if (!infoMap[id]) infoMap[id] = { ...info, id };
                  }
                }
                const processed = processAnalytics(aData);
                setLoadedData((prev) => new Map(prev).set(eventId, processed));
              })
          )
        );

        // Fallback names for orgs not found in analytics
        for (const orgId of orgIds) {
          if (!infoMap[orgId]) {
            infoMap[orgId] = { id: orgId, name: orgId, logo: "", description: "" };
          }
        }
        setOrgInfoMap(infoMap);
        if (!savedOrgId || !orgIds.includes(savedOrgId)) {
          if (orgIds.length > 0) setSelectedOrgId(orgIds[0]);
        }
      } catch (err: unknown) {
        setDiscoveryError(err instanceof Error ? err.message : "Failed to load events");
      } finally {
        setDiscoveryLoading(false);
      }
    })();
  }, []);

  const selectedOrg = selectedOrgId ? orgInfoMap[selectedOrgId] || null : null;

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
    if (selectedOrgId) sessionStorage.setItem("biq-org-selectedOrg", selectedOrgId);
  }, [selectedOrgId]);

  useEffect(() => {
    sessionStorage.setItem("biq-org-selectedEvents", JSON.stringify(Array.from(selectedEventIds)));
  }, [selectedEventIds]);

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
    // Clean up any selected IDs that don't belong to this org
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
          {selectedOrg && (
            <div className="flex items-center gap-2 ml-1">
              <div className="w-px h-4" style={{ background: "rgba(255,255,255,0.08)" }} />
              {selectedOrg.logo && (
                <img src={selectedOrg.logo} alt="" className="w-6 h-6 rounded-md object-cover"
                  style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
              )}
              <span className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
                {selectedOrg.name}
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
          {discoveryLoading && (
            <div className="w-3 h-3 rounded-full animate-spin" style={{ border: "2px solid var(--accent)", borderTopColor: "transparent" }} />
          )}
          {allOrgIds.length > 1 && (
            <div className="relative">
              <select value={selectedOrgId || ""}
                onChange={(e) => { setSelectedOrgId(e.target.value); setSelectedEventIds(new Set()); sessionStorage.removeItem("biq-org-selectedEvents"); }}
                className="skeuo-input px-3 py-1.5 text-[11px] appearance-none pr-6 cursor-pointer"
                style={{ minWidth: 160 }}>
                {allOrgIds.map((oid) => (
                  <option key={oid} value={oid}>{orgInfoMap[oid]?.name || oid}</option>
                ))}
              </select>
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          )}
        </div>
      </header>

      {/* ── Loading / Error / Empty ── */}
      {discoveryLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      )}
      {discoveryError && (
        <div className="skeuo-panel p-3 text-[11px] m-3" style={{ color: "var(--red)" }}>{discoveryError}</div>
      )}
      {!discoveryLoading && !discoveryError && allOrgIds.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: "var(--text-tertiary)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span className="text-[13px]">No events found</span>
        </div>
      )}

      {/* ── Main: sidebar + dashboard ── */}
      {!discoveryLoading && !discoveryError && selectedOrgId && (
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
              {orgEvents.length === 0 && allEvents.length === 0 ? (
                <div className="flex items-center justify-center h-20 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  No events
                </div>
              ) : (
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
              )}
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
