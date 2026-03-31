"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { AnalyticsResponse, ProcessedData, Beacon, LumaGuest } from "@/types";
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

function exportCSV(data: ProcessedData, customBeaconNames: Record<string, string> = {}) {
  const beaconIds = Object.keys(data.beacons);
  const beaconNames = beaconIds.map((id) => customBeaconNames[id] || id.substring(0, 10));

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

function parseLumaCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else current += ch;
  }
  result.push(current);
  return result;
}

function parseLumaCSV(text: string): LumaGuest[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLumaCSVLine(lines[0]).map((h) => h.trim());
  const guests: LumaGuest[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLumaCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || "").trim(); });
    if (row.solana_address) {
      guests.push({
        api_id: row.api_id || "",
        name: row.name || "",
        email: row.email || "",
        solana_address: row.solana_address,
      });
    }
  }
  return guests;
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
  const [orgName, setOrgName] = useState<string | null>(null);

  // Luma check-in: wallet → guest mapping
  const [lumaGuests, setLumaGuests] = useState<Record<string, LumaGuest>>({});
  const [lumaTotal, setLumaTotal] = useState(0);

  // Load Luma guests from localStorage
  useEffect(() => {
    if (!eventId) return;
    const saved = loadFromStorage<{ guests: Record<string, LumaGuest>; total: number }>(`luma-guests-${eventId}`, { guests: {}, total: 0 });
    if (saved.total > 0) {
      setLumaGuests(saved.guests);
      setLumaTotal(saved.total);
    }
  }, [eventId]);

  const handleLumaCSV = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const guests = parseLumaCSV(text);
      const map: Record<string, LumaGuest> = {};
      for (const g of guests) {
        map[g.solana_address.toLowerCase()] = g;
      }
      setLumaGuests(map);
      setLumaTotal(guests.length);
      if (eventId) saveToStorage(`luma-guests-${eventId}`, { guests: map, total: guests.length });
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [eventId]);

  const selectedUserJourney = useMemo(() => {
    if (!selectedUserId || !processed) return undefined;
    const user = processed.userDetails.find((u) => u.userId === selectedUserId);
    return user?.beaconTimeline;
  }, [selectedUserId, processed]);

  // Per-beacon dwell time (seconds) for selected user — filtered by playbackTime
  const selectedUserBeaconDwell = useMemo<Record<string, number> | undefined>(() => {
    if (!selectedUserJourney || selectedUserJourney.length < 2) return undefined;
    const cutoff = playbackTime ?? Infinity;
    const dwell: Record<string, number> = {};
    for (let i = 0; i < selectedUserJourney.length - 1; i++) {
      if (selectedUserJourney[i].time > cutoff) break;
      const bid = selectedUserJourney[i].beaconId;
      const nextTime = Math.min(selectedUserJourney[i + 1].time, cutoff);
      const duration = nextTime - selectedUserJourney[i].time;
      if (duration > 0) dwell[bid] = (dwell[bid] || 0) + duration;
    }
    return Object.keys(dwell).length > 0 ? dwell : undefined;
  }, [selectedUserJourney, playbackTime]);

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
      const data = await fetchData(eid) as AnalyticsResponse & { organizers?: Record<string, { name: string }> };
      setRawData(data);
      // Extract organizer name
      const orgId = data.event.organizerId?.[0];
      if (orgId && data.organizers?.[orgId]) {
        setOrgName(data.organizers[orgId].name);
      }
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

      // Auto-select first user
      if (proc.userDetails.length > 0) {
        setSelectedUserId(proc.userDetails[0].userId);
      }
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

  const rawDataRef = useRef(rawData);
  rawDataRef.current = rawData;

  const refreshData = useCallback(async () => {
    if (!eventId || !rawDataRef.current || !lastUpdateRef.current) return;
    try {
      const update = await fetchData(eventId, lastUpdateRef.current);
      if (update.proofs && update.proofs.length > 0) {
        const merged = mergeAnalytics(rawDataRef.current, update);
        setRawData(merged);
        setProcessed(processAnalytics(merged));
      }
      lastUpdateRef.current = update.lastUpdate;
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Refresh failed:", err);
    }
  }, [eventId, fetchData]);

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

  const handleChartClickUser = useCallback((uid: string) => {
    setSelectedUserId(uid);
    setActiveTab("users");
  }, []);

  useEffect(() => {
    if (activeTab !== "users") setSelectedUserId(null);
    if (activeTab !== "beacons") { setSelectedBeaconId(null); setFilteredBeaconIds(null); }
  }, [activeTab]);


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

  // Pre-sort proofs and pre-compute per-user timelines once
  const sortedProofs = useMemo(() => {
    if (!processed) return [];
    return [...processed.proofs].sort((a, b) => a.time - b.time);
  }, [processed]);

  const userTimelines = useMemo(() => {
    const map: Record<string, { beaconId: string; time: number }[]> = {};
    for (const p of sortedProofs) {
      if (!map[p.userId]) map[p.userId] = [];
      map[p.userId].push({ beaconId: p.beaconId, time: p.time });
    }
    return map;
  }, [sortedProofs]);

  const playbackMapOverrides = useMemo(() => {
    if (playbackTime == null || !processed) return null;

    // Binary search for cutoff index in pre-sorted proofs
    let lo = 0, hi = sortedProofs.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedProofs[mid].time <= playbackTime) lo = mid + 1;
      else hi = mid;
    }

    const counts: Record<string, number> = {};
    for (let i = 0; i < lo; i++) {
      const bid = sortedProofs[i].beaconId;
      counts[bid] = (counts[bid] || 0) + 1;
    }

    const transitionMap: Record<string, number> = {};
    for (const timeline of Object.values(userTimelines)) {
      let prevBeacon: string | null = null;
      for (const entry of timeline) {
        if (entry.time > playbackTime) break;
        if (prevBeacon !== null && prevBeacon !== entry.beaconId) {
          const key = [prevBeacon, entry.beaconId].sort().join("||");
          transitionMap[key] = (transitionMap[key] || 0) + 1;
        }
        prevBeacon = entry.beaconId;
      }
    }
    const transitions = Object.entries(transitionMap).map(([key, count]) => {
      const [from, to] = key.split("||");
      return { from, to, count };
    });

    return { beaconProofCounts: counts, transitions, proofs: sortedProofs.slice(0, lo) };
  }, [playbackTime, processed, sortedProofs, userTimelines]);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--bg-texture)" }}>
      {/* Header */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-5 h-[52px]"
        style={{
          background: "var(--header-bg)",
          borderBottom: "1px solid var(--header-border)",
          boxShadow: "var(--header-shadow)",
        }}
      >
        <div className="flex items-center gap-1.5">
          {processed && (<>
            {processed.event.organizerId?.[0] && (
              <>
                <a href={`/organizer/${processed.event.organizerId[0]}`}
                  className="text-[10px] font-bold hover:underline"
                  style={{ color: "var(--text-tertiary)" }}>
                  {orgName || "Organizer"}
                </a>
                <span className="text-[9px]" style={{ color: "var(--text-tertiary)", opacity: 0.5 }}>/</span>
              </>
            )}
            {processed.event.image && (
              <img
                src={processed.event.image} alt=""
                className="w-5 h-5 rounded object-cover"
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
              />
            )}
            <span className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
              {processed.event.name}
            </span>
          </>)}
        </div>

        {processed && (
          <div className="skeuo-tab-group flex items-center gap-0.5">
            {(["overview", "users", "beacons"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3.5 py-1 rounded-md text-[11px] font-bold capitalize transition-all duration-100"
                style={{
                  background: activeTab === tab ? "var(--selected-bg)" : "transparent",
                  color: activeTab === tab ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: activeTab === tab ? "var(--selected-shadow)" : "none",
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
              <label
                className="skeuo-btn px-3 py-1.5 text-[11px] font-bold cursor-pointer"
                style={{ color: "#a855f7", borderColor: "#a855f744" }}
                title="Upload Luma guest CSV for automatic check-in"
              >
                {lumaTotal > 0 ? `Lu.ma ${(() => {
                  const matched = processed.userDetails.filter(u => lumaGuests[u.userId.toLowerCase()]).length;
                  return `${matched}/${lumaTotal}`;
                })()}` : "Lu.ma CSV"}
                <input type="file" accept=".csv" onChange={handleLumaCSV} className="hidden" />
              </label>
              <button
                onClick={() => exportCSV(processed, beaconNames)}
                className="skeuo-btn px-3 py-1.5 text-[11px] font-bold mr-8"
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
                      <CheckInChart data={processed.checkInTimeline} profiles={processed.profiles} onClickUser={handleChartClickUser} />
                    </div>
                    <div className="flex-1 min-h-0">
                      <CheckOutChart data={processed.checkOutTimeline} profiles={processed.profiles} onClickUser={handleChartClickUser} />
                    </div>
                    <div className="flex-1 min-h-0">
                      <DwellTimeChart data={processed.dwellTimes} profiles={processed.profiles} onClickUser={handleChartClickUser} />
                    </div>
                  </>
                )}
                {activeTab === "users" && (() => {
                  const selectedUser = selectedUserId ? processed.userDetails.find(u => u.userId === selectedUserId) : null;
                  return (
                    <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
                      <div className="w-[220px] flex-shrink-0 min-h-0 h-full">
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
                          lumaGuests={lumaTotal > 0 ? lumaGuests : undefined}
                        />
                      </div>
                      <div className="flex-1 min-w-0 min-h-0 h-full overflow-hidden">
                        {selectedUser ? (
                          <UserDetailPanel user={selectedUser} beacons={processed.beacons} beaconNames={beaconNames} onTimeClick={setPlaybackTime} lumaGuest={lumaGuests[selectedUser.userId.toLowerCase()]} />
                        ) : (
                          <div className="skeuo-panel h-full flex items-center justify-center">
                            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Select a user to see details</span>
                          </div>
                        )}
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
                    <BeaconHeatmap
                      {...beaconMapProps}
                      selectedUserJourney={selectedUserJourney}
                      selectedUserId={selectedUserId}
                      userBeaconDwell={selectedUserBeaconDwell}
                      eventStartTime={processed.event.startTime}
                      eventEndTime={processed.event.endTime}
                      onPlaybackTime={setPlaybackTime}
                      playbackTime={playbackTime}
                      onClickUser={handleChartClickUser}
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
                      onClickUser={handleChartClickUser}
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
