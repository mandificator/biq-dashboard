"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { AnalyticsResponse, ProcessedData, Beacon } from "@/types";
import { processAnalytics, mergeAnalytics } from "@/lib/processData";
import StatsCards from "@/components/StatsCards";
import BeaconHeatmap from "@/components/BeaconHeatmap";
import { CheckInChart, CheckOutChart, DwellTimeChart } from "@/components/Charts";
import UsersTab, { UserDetailPanel } from "@/components/UsersTab";
import BeaconsTab from "@/components/BeaconsTab";

const REFRESH_INTERVAL = 30_000;

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function formatTsCSV(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDurCSV(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function exportCSV(data: ProcessedData) {
  const beaconIds = Object.keys(data.beacons);
  const beaconNames = beaconIds.map((id) => data.beacons[id]?.name || id.substring(0, 10));

  const userBeaconCounts: Record<string, Record<string, number>> = {};
  for (const proof of data.proofs) {
    if (!userBeaconCounts[proof.userId]) userBeaconCounts[proof.userId] = {};
    userBeaconCounts[proof.userId][proof.beaconId] = (userBeaconCounts[proof.userId][proof.beaconId] || 0) + 1;
  }

  const headers = [
    "Name", "Wallet", "Proofs", "Check-in", "Check-out", "Dwell Time",
    ...beaconNames,
  ];

  const rows = data.userDetails.map((u) => {
    const name = u.profile?.displayName || "";
    const beaconCols = beaconIds.map((bid) => String(userBeaconCounts[u.userId]?.[bid] || 0));
    return [
      escapeCSV(name),
      escapeCSV(u.userId),
      String(u.proofCount),
      escapeCSV(formatTsCSV(u.firstProof)),
      escapeCSV(formatTsCSV(u.lastProof)),
      escapeCSV(formatDurCSV(u.dwellMinutes)),
      ...beaconCols,
    ];
  });

  const csv = [headers.map(escapeCSV).join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.event.name || "export"}_users.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function initCirclePositions(beacons: Record<string, Beacon>): Record<string, { x: number; y: number }> {
  const list = Object.values(beacons);
  const cx = 200, cy = 200;
  const radius = list.length === 1 ? 0 : 130;
  const pos: Record<string, { x: number; y: number }> = {};
  list.forEach((b, i) => {
    const angle = (2 * Math.PI * i) / list.length - Math.PI / 2;
    pos[b.id] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
  return pos;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function EventPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [rawData, setRawData] = useState<AnalyticsResponse | null>(null);
  const [processed, setProcessed] = useState<ProcessedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "beacons">("overview");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number | null>(null);

  const [beaconPositions, setBeaconPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [beaconNames, setBeaconNames] = useState<Record<string, string>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedBeaconId, setSelectedBeaconId] = useState<string | null>(null);
  const [filteredBeaconIds, setFilteredBeaconIds] = useState<string[] | null>(null);
  const [playbackTime, setPlaybackTime] = useState<number | null>(null);

  const selectedUserJourney = useMemo(() => {
    if (!selectedUserId || !processed) return undefined;
    const user = processed.userDetails.find((u) => u.userId === selectedUserId);
    return user?.beaconTimeline;
  }, [selectedUserId, processed]);

  const fetchData = useCallback(async (eid: string, since?: number) => {
    const params = new URLSearchParams({ eventId: eid });
    if (since) params.append("since", since.toString());
    const res = await fetch(`/api/analytics?${params.toString()}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return (await res.json()) as AnalyticsResponse;
  }, []);

  const loadInitial = useCallback(async (eid: string) => {
    setLoading(true);
    setError(null);
    setSelectedUserId(null);
    try {
      const data = await fetchData(eid);
      setRawData(data);
      const proc = processAnalytics(data);
      setProcessed(proc);
      lastUpdateRef.current = data.lastUpdate;
      setLastRefresh(new Date());

      const savedPos = loadFromStorage<Record<string, { x: number; y: number }>>(`biq-beacon-pos-${eid}`, {});
      const allBeaconIds = Object.keys(data.beacons);
      const hasAllSaved = allBeaconIds.length > 0 && allBeaconIds.every((id) => savedPos[id]);
      setBeaconPositions(hasAllSaved ? savedPos : initCirclePositions(data.beacons));

      const savedNames = loadFromStorage<Record<string, string>>(`biq-beacon-names-${eid}`, {});
      setBeaconNames(savedNames);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  // Auto-load on mount
  useEffect(() => {
    if (eventId) loadInitial(eventId);
  }, [eventId, loadInitial]);

  const refreshData = useCallback(async () => {
    if (!eventId || !rawData || !lastUpdateRef.current) return;
    try {
      const update = await fetchData(eventId, lastUpdateRef.current);
      if (update.proofs && update.proofs.length > 0) {
        const merged = mergeAnalytics(rawData, update);
        setRawData(merged);
        setProcessed(processAnalytics(merged));
      }
      lastUpdateRef.current = update.lastUpdate;
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Refresh failed:", err);
    }
  }, [eventId, rawData, fetchData]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh && eventId && rawData) {
      intervalRef.current = setInterval(refreshData, REFRESH_INTERVAL);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, eventId, rawData, refreshData]);

  const handlePositionChange = useCallback((beaconId: string, pos: { x: number; y: number }) => {
    setBeaconPositions((prev) => {
      const next = { ...prev, [beaconId]: pos };
      if (eventId) saveToStorage(`biq-beacon-pos-${eventId}`, next);
      return next;
    });
  }, [eventId]);

  const handleNameChange = useCallback((beaconId: string, name: string) => {
    setBeaconNames((prev) => {
      const next = { ...prev, [beaconId]: name };
      if (eventId) saveToStorage(`biq-beacon-names-${eventId}`, next);
      return next;
    });
  }, [eventId]);

  useEffect(() => {
    if (activeTab !== "users") setSelectedUserId(null);
    if (activeTab !== "beacons") { setSelectedBeaconId(null); setFilteredBeaconIds(null); }
  }, [activeTab]);

  // ── Global keyboard navigation ──
  const [navZone, setNavZone] = useState(0);
  const [navItem, setNavItem] = useState(0);

  useEffect(() => { setNavItem(0); }, [navZone, activeTab]);
  useEffect(() => { setNavZone(0); }, [activeTab]);

  useEffect(() => {
    document.querySelectorAll("[data-nav-active]").forEach((el) => el.removeAttribute("data-nav-active"));
    const items = document.querySelectorAll(`[data-nav-zone="${navZone}"]`);
    const clamped = Math.min(navItem, items.length - 1);
    if (clamped >= 0 && items[clamped]) {
      items[clamped].setAttribute("data-nav-active", "true");
      (items[clamped] as HTMLElement).scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  }, [navZone, navItem]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const getCount = (z: number) => document.querySelectorAll(`[data-nav-zone="${z}"]`).length;
      const maxZone = activeTab === "overview" ? 2 : 1;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setNavItem((prev) => Math.min(prev + 1, getCount(navZone) - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setNavItem((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (navZone === 3) {
          setNavItem((prev) => Math.min(prev + 1, getCount(3) - 1));
        } else {
          setNavZone((prev) => Math.min(prev + 1, maxZone));
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (navZone === 3) {
          if (navItem === 0) { setNavZone(2); }
          else { setNavItem((prev) => Math.max(prev - 1, 0)); }
        } else {
          setNavZone((prev) => Math.max(prev - 1, 0));
        }
      } else if (e.key === " ") {
        e.preventDefault();
        const items = document.querySelectorAll(`[data-nav-zone="${navZone}"]`);
        const el = items[Math.min(navItem, items.length - 1)] as HTMLElement;
        if (el) {
          if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "checkbox") {
            (el as HTMLInputElement).click();
          } else {
            el.click();
          }
          if (navZone === 2 && activeTab === "overview") {
            setTimeout(() => {
              if (getCount(3) > 0) { setNavZone(3); setNavItem(0); }
            }, 50);
          }
        }
      } else if (e.key === "e" || e.key === "E") {
        if (processed) exportCSV(processed);
      } else if (e.key === "Escape") {
        if (navZone === 3) setNavZone(2);
        else setNavZone(0);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [navZone, navItem, activeTab, processed]);

  const beaconMapProps = useMemo(() => processed ? {
    beacons: processed.beacons,
    beaconProofCounts: processed.beaconProofCounts,
    transitions: processed.userBeaconTransitions,
    positions: beaconPositions,
    onPositionChange: handlePositionChange,
    names: beaconNames,
    onNameChange: handleNameChange,
    proofs: processed.proofs,
    profiles: processed.profiles,
    eventName: processed.event.name,
  } : null, [processed, beaconPositions, handlePositionChange, beaconNames, handleNameChange]);

  const playbackMapOverrides = useMemo(() => {
    if (playbackTime == null || !processed) return null;

    const filteredProofs = processed.proofs.filter((p) => p.time <= playbackTime);

    const counts: Record<string, number> = {};
    for (const p of filteredProofs) {
      counts[p.beaconId] = (counts[p.beaconId] || 0) + 1;
    }

    const userProofs: Record<string, typeof filteredProofs> = {};
    for (const p of filteredProofs) {
      if (!userProofs[p.userId]) userProofs[p.userId] = [];
      userProofs[p.userId].push(p);
    }
    const transitionMap: Record<string, number> = {};
    for (const uid of Object.keys(userProofs)) {
      const ups = userProofs[uid].sort((a, b) => a.time - b.time);
      for (let i = 1; i < ups.length; i++) {
        if (ups[i].beaconId === ups[i - 1].beaconId) continue;
        const key = [ups[i - 1].beaconId, ups[i].beaconId].sort().join("||");
        transitionMap[key] = (transitionMap[key] || 0) + 1;
      }
    }
    const transitions = Object.entries(transitionMap).map(([key, count]) => {
      const [from, to] = key.split("||");
      return { from, to, count };
    });

    return { beaconProofCounts: counts, transitions, proofs: filteredProofs };
  }, [playbackTime, processed]);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--bg-texture)" }}>
      {/* Header */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-5 h-[52px]"
        style={{
          background: "linear-gradient(180deg, #2e2e34 0%, #242428 60%, #202024 100%)",
          borderBottom: "1px solid rgba(0,0,0,0.5)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-3">
          {processed && (
            <div className="flex items-center gap-2">
              {processed.event.image && (
                <img
                  src={processed.event.image} alt=""
                  className="w-6 h-6 rounded-md object-cover"
                  style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
                />
              )}
              <span className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
                {processed.event.name}
              </span>
            </div>
          )}
        </div>

        {processed && (
          <div className="skeuo-tab-group flex items-center gap-0.5">
            {(["overview", "users", "beacons"] as const).map((tab) => (
              <button
                key={tab}
                data-nav-zone="0"
                onClick={() => setActiveTab(tab)}
                className="px-3.5 py-1 rounded-md text-[11px] font-bold capitalize transition-all duration-100"
                style={{
                  background: activeTab === tab
                    ? "linear-gradient(180deg, #363640 0%, #2a2a32 100%)"
                    : "transparent",
                  color: activeTab === tab ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: activeTab === tab
                    ? "1px 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)"
                    : "none",
                }}
              >
                {tab === "users" ? <>Users <span style={{ color: "var(--text-tertiary)" }}>({processed.totalAttendees})</span></> : tab === "beacons" ? <>Beacons <span style={{ color: "var(--text-tertiary)" }}>({Object.keys(processed.beacons).length})</span></> : tab}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2.5">
          {processed && (
            <>
              <div className="flex items-center gap-2">
                {lastRefresh && (
                  <span className="text-[9px] font-bold" style={{ color: "var(--text-tertiary)" }}>
                    {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className="w-6 h-6 rounded-md flex items-center justify-center transition-all duration-100 skeuo-btn"
                  title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
                  style={{ padding: 0 }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={autoRefresh ? "var(--text-primary)" : "var(--text-tertiary)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => exportCSV(processed)}
                className="skeuo-btn px-3 py-1.5 text-[11px] font-bold"
                style={{ color: "#8CC63F", borderColor: "#8CC63F44" }}
              >
                Export
              </button>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 min-h-0 p-3">
        {error && (
          <div className="skeuo-panel p-3 text-[11px] mb-3" style={{ color: "var(--red)", borderColor: "rgba(240, 96, 80, 0.2)" }}>
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          </div>
        )}

        {processed && beaconMapProps && (
          <div className="flex flex-col gap-3 h-full">
            <StatsCards
              totalAttendees={processed.totalAttendees}
              currentlyPresent={processed.currentlyPresent}
              alreadyLeft={processed.alreadyLeft}
              avgDwellMinutes={processed.avgDwellMinutes}
            />

            <div className="flex gap-3 flex-1 min-h-0">
              <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
                {activeTab === "overview" && (
                  <>
                    <div className="flex-1 min-h-0">
                      <CheckInChart data={processed.checkInTimeline} profiles={processed.profiles} onClickUser={(uid) => { setSelectedUserId(uid); setActiveTab("users"); }} />
                    </div>
                    <div className="flex-1 min-h-0">
                      <CheckOutChart data={processed.checkOutTimeline} profiles={processed.profiles} onClickUser={(uid) => { setSelectedUserId(uid); setActiveTab("users"); }} />
                    </div>
                    <div className="flex-1 min-h-0">
                      <DwellTimeChart data={processed.dwellTimes} profiles={processed.profiles} onClickUser={(uid) => { setSelectedUserId(uid); setActiveTab("users"); }} />
                    </div>
                  </>
                )}
                {activeTab === "users" && (() => {
                  const selectedUser = selectedUserId ? processed.userDetails.find(u => u.userId === selectedUserId) : null;
                  return (
                    <div className="flex-1 min-h-0 flex flex-col gap-3">
                      {selectedUser ? (
                        <UserDetailPanel user={selectedUser} beacons={processed.beacons} beaconNames={beaconNames} />
                      ) : (
                        <div className="skeuo-panel flex items-center justify-center" style={{ minHeight: 80 }}>
                          <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Select a user to see details</span>
                        </div>
                      )}
                      <div className="flex-1 min-h-0">
                        <BeaconHeatmap
                          {...beaconMapProps}
                          selectedUserJourney={selectedUserJourney}
                          eventStartTime={processed.event.startTime}
                          eventEndTime={processed.event.endTime}
                          onPlaybackTime={setPlaybackTime}
                          playbackTime={playbackTime}
                        />
                      </div>
                    </div>
                  );
                })()}
                {activeTab === "beacons" && (
                  <div className="flex-1 min-h-0">
                    <BeaconsTab
                      beacons={processed.beacons}
                      beaconNames={beaconNames}
                      beaconProofCounts={processed.beaconProofCounts}
                      transitions={processed.userBeaconTransitions}
                      proofs={processed.proofs}
                      profiles={processed.profiles}
                      selectedBeaconId={selectedBeaconId}
                      onSelectBeacon={setSelectedBeaconId}
                      onFilteredBeacons={setFilteredBeaconIds}
                    />
                  </div>
                )}
              </div>

              <div className="w-[40%] flex-shrink-0 h-full flex flex-col gap-3">
                {activeTab === "users" && (
                  <div className="flex-1 min-h-0">
                    <UsersTab
                      users={processed.userDetails}
                      beacons={processed.beacons}
                      beaconNames={beaconNames}
                      selectedUserId={selectedUserId}
                      onSelectUser={setSelectedUserId}
                      eventStartTime={processed.event.startTime}
                      eventEndTime={processed.event.endTime}
                      dwellTimes={processed.dwellTimes}
                      profiles={processed.profiles}
                    />
                  </div>
                )}
                {activeTab !== "users" && (
                  <div className="flex-1 min-h-0">
                    <BeaconHeatmap
                      {...beaconMapProps}
                      {...(activeTab === "beacons" && playbackMapOverrides ? {
                        beaconProofCounts: playbackMapOverrides.beaconProofCounts,
                        transitions: playbackMapOverrides.transitions,
                        proofs: playbackMapOverrides.proofs,
                      } : {})}
                      selectedBeaconId={activeTab === "beacons" ? selectedBeaconId : undefined}
                      onSelectBeacon={activeTab === "beacons" ? setSelectedBeaconId : undefined}
                      filteredBeaconIds={activeTab === "beacons" ? filteredBeaconIds : undefined}
                      eventStartTime={processed.event.startTime}
                      eventEndTime={processed.event.endTime}
                      onPlaybackTime={setPlaybackTime}
                      playbackTime={playbackTime}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
