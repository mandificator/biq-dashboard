"use client";

import React from "react";
import { Beacon, Proof, Profile } from "@/types";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";

const Avatar = React.memo(function Avatar({ src, name, size = 32 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initial = name[0]?.toUpperCase() || "?";
  const px = `${size}px`;

  if (!src || failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0 font-bold skeuo-inset"
        style={{ width: px, height: px, fontSize: size * 0.38, color: "#9a9aa6", borderRadius: "50%" }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src} alt="" referrerPolicy="no-referrer" crossOrigin="anonymous"
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: px, height: px, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.4)" }}
      onError={() => setFailed(true)}
    />
  );
});

interface Props {
  beacons: Record<string, Beacon>;
  beaconNames: Record<string, string>;
  beaconProofCounts: Record<string, number>;
  transitions: { from: string; to: string; count: number }[];
  proofs: Proof[];
  profiles: Record<string, Profile>;
  selectedBeaconId: string | null;
  onSelectBeacon: (id: string | null) => void;
  onFilteredBeacons?: (ids: string[] | null) => void;
}

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function getBeaconDisplayName(b: Beacon, names: Record<string, string>): string {
  if (names[b.id]) return names[b.id];
  return b.name || b.id.substring(0, 10);
}

interface BeaconCluster {
  id: string;
  label: string;
  color: string;
  description: string;
  beaconIds: Set<string>;
}

function clusterBeacons(
  beacons: Record<string, Beacon>,
  proofCounts: Record<string, number>,
  transitions: { from: string; to: string; count: number }[],
  proofs: Proof[],
): BeaconCluster[] {
  const ids = Object.keys(beacons);
  if (ids.length === 0) return [];

  const counts = ids.map((id) => proofCounts[id] || 0).sort((a, b) => a - b);
  const p25 = counts[Math.floor(counts.length * 0.25)] || 0;
  const p75 = counts[Math.floor(counts.length * 0.75)] || 0;

  // Hub: 3+ unique transitions to/from
  const transitionCount: Record<string, Set<string>> = {};
  for (const t of transitions) {
    if (!transitionCount[t.from]) transitionCount[t.from] = new Set();
    if (!transitionCount[t.to]) transitionCount[t.to] = new Set();
    transitionCount[t.from].add(t.to);
    transitionCount[t.to].add(t.from);
  }

  // Entry point: first beacon for >= 20% of users
  const userFirstBeacon: Record<string, string> = {};
  const proofsByUser: Record<string, Proof[]> = {};
  for (const p of proofs) {
    if (!proofsByUser[p.userId]) proofsByUser[p.userId] = [];
    proofsByUser[p.userId].push(p);
  }
  const totalUsers = Object.keys(proofsByUser).length;
  for (const uid of Object.keys(proofsByUser)) {
    const sorted = proofsByUser[uid].sort((a, b) => a.time - b.time);
    if (sorted.length > 0) userFirstBeacon[uid] = sorted[0].beaconId;
  }
  const firstBeaconCounts: Record<string, number> = {};
  for (const bid of Object.values(userFirstBeacon)) {
    firstBeaconCounts[bid] = (firstBeaconCounts[bid] || 0) + 1;
  }
  const entryThreshold = totalUsers * 0.2;

  const highTraffic = new Set<string>();
  const hub = new Set<string>();
  const entryPoint = new Set<string>();
  const lowActivity = new Set<string>();

  for (const id of ids) {
    const count = proofCounts[id] || 0;
    if (count >= p75 && p75 > p25) highTraffic.add(id);
    if ((transitionCount[id]?.size || 0) >= 3) hub.add(id);
    if ((firstBeaconCounts[id] || 0) >= entryThreshold && entryThreshold > 0) entryPoint.add(id);
    if (count <= p25 && p25 < p75) lowActivity.add(id);
  }

  const clusters: BeaconCluster[] = [];
  if (highTraffic.size > 0) clusters.push({
    id: "high", label: "High Traffic", color: "#F7941D",
    description: "Top 25% by proof count", beaconIds: highTraffic,
  });
  if (hub.size > 0) clusters.push({
    id: "hub", label: "Hub", color: "#8CC63F",
    description: "3+ transitions to/from other beacons", beaconIds: hub,
  });
  if (entryPoint.size > 0) clusters.push({
    id: "entry", label: "Entry Point", color: "#00D4F5",
    description: "Many users' first beacon", beaconIds: entryPoint,
  });
  if (lowActivity.size > 0) clusters.push({
    id: "low", label: "Low Activity", color: "#8CC63F",
    description: "Bottom 25% by proof count", beaconIds: lowActivity,
  });

  return clusters;
}

interface VisitorRow {
  userId: string;
  profile: Profile | null;
  firstVisit: number;
  lastVisit: number;
  proofCount: number;
}

function ClusterDropdown({ value, onChange, allLabel, options }: {
  value: string | null;
  onChange: (v: string | null) => void;
  allLabel: string;
  options: { id: string; label: string; count: number; color: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="px-2 pb-2 relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="skeuo-input w-full px-2.5 py-1.5 text-[11px] font-bold flex items-center justify-between text-left"
        style={{ color: active?.color || "var(--text-primary)" }}
      >
        <span className="flex items-center gap-1.5 truncate">
          {active && (
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active.color, boxShadow: `0 0 4px ${active.color}` }} />
          )}
          {active ? `${active.label} (${active.count})` : allLabel}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute left-2 right-2 z-20 mt-1 py-1 rounded-lg overflow-hidden"
          style={{
            background: "linear-gradient(180deg, #2e2e34 0%, #262628 100%)",
            border: "1px solid #4a4a52",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            className="w-full text-left px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
            style={{
              color: !value ? "var(--text-primary)" : "var(--text-secondary)",
              background: !value ? "rgba(255,255,255,0.05)" : "transparent",
            }}
            onMouseEnter={(e) => { if (value) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            onMouseLeave={(e) => { if (value) e.currentTarget.style.background = "transparent"; }}
          >
            {allLabel}
          </button>
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => { onChange(o.id); setOpen(false); }}
              className="w-full text-left px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
              style={{
                color: value === o.id ? o.color : "var(--text-secondary)",
                background: value === o.id ? `${o.color}11` : "transparent",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${o.color}15`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = value === o.id ? `${o.color}11` : "transparent"; }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color, boxShadow: `0 0 4px ${o.color}` }} />
              {o.label} ({o.count})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BeaconsTab({
  beacons,
  beaconNames,
  beaconProofCounts,
  transitions,
  proofs,
  profiles,
  selectedBeaconId,
  onSelectBeacon,
  onFilteredBeacons,
}: Props) {
  const [search, setSearch] = useState("");
  const [activeCluster, setActiveCluster] = useState<string | null>(null);

  const beaconList = useMemo(() => Object.values(beacons), [beacons]);

  const clusters = useMemo(
    () => clusterBeacons(beacons, beaconProofCounts, transitions, proofs),
    [beacons, beaconProofCounts, transitions, proofs],
  );

  // Unique visitor counts per beacon
  const uniqueVisitors = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const p of proofs) {
      if (!map[p.beaconId]) map[p.beaconId] = new Set();
      map[p.beaconId].add(p.userId);
    }
    const counts: Record<string, number> = {};
    for (const [bid, set] of Object.entries(map)) counts[bid] = set.size;
    return counts;
  }, [proofs]);

  // Cluster membership lookup
  const beaconClusterMap = useMemo(() => {
    const map: Record<string, BeaconCluster> = {};
    for (const c of clusters) {
      for (const bid of c.beaconIds) {
        if (!map[bid]) map[bid] = c; // first cluster wins for dot color
      }
    }
    return map;
  }, [clusters]);

  const displayBeacons = useMemo(() => {
    let list = beaconList;

    if (activeCluster) {
      const cluster = clusters.find((c) => c.id === activeCluster);
      if (cluster) list = list.filter((b) => cluster.beaconIds.has(b.id));
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((b) => {
        const name = getBeaconDisplayName(b, beaconNames);
        return name.toLowerCase().includes(q);
      });
    }

    return [...list].sort((a, b) => (beaconProofCounts[b.id] || 0) - (beaconProofCounts[a.id] || 0));
  }, [beaconList, clusters, activeCluster, search, beaconNames, beaconProofCounts]);

  // Report filtered beacons to parent
  const isFiltering = !!(activeCluster || search);
  useEffect(() => {
    if (onFilteredBeacons) {
      onFilteredBeacons(isFiltering ? displayBeacons.map((b) => b.id) : null);
    }
  }, [displayBeacons, isFiltering, onFilteredBeacons]);

  const selectedBeacon = selectedBeaconId ? beacons[selectedBeaconId] : null;

  // Visitors for selected beacon
  const visitors = useMemo<VisitorRow[]>(() => {
    if (!selectedBeaconId) return [];
    const beaconProofs = proofs.filter((p) => p.beaconId === selectedBeaconId);
    const byUser: Record<string, Proof[]> = {};
    for (const p of beaconProofs) {
      if (!byUser[p.userId]) byUser[p.userId] = [];
      byUser[p.userId].push(p);
    }
    const rows: VisitorRow[] = Object.entries(byUser).map(([uid, ps]) => {
      const sorted = ps.sort((a, b) => a.time - b.time);
      return {
        userId: uid,
        profile: profiles[uid] || null,
        firstVisit: sorted[0].time,
        lastVisit: sorted[sorted.length - 1].time,
        proofCount: ps.length,
      };
    });
    return rows.sort((a, b) => a.firstVisit - b.firstVisit);
  }, [selectedBeaconId, proofs, profiles]);

  // Transition count for selected beacon
  const transitionCount = useMemo(() => {
    if (!selectedBeaconId) return 0;
    return transitions.filter((t) => t.from === selectedBeaconId || t.to === selectedBeaconId)
      .reduce((s, t) => s + t.count, 0);
  }, [selectedBeaconId, transitions]);

  // Avg dwell for selected beacon (avg time between first and last proof per user, in minutes)
  const avgDwell = useMemo(() => {
    if (!selectedBeaconId || visitors.length === 0) return 0;
    const dwells = visitors.map((v) => (v.lastVisit - v.firstVisit) / 60);
    return Math.round(dwells.reduce((s, d) => s + d, 0) / dwells.length);
  }, [selectedBeaconId, visitors]);

  return (
    <div className="flex gap-3 h-full">
      {/* Beacon list */}
      <div className="skeuo-panel w-[200px] flex-shrink-0 flex flex-col overflow-hidden">
        {/* Search */}
        <div className="p-2 pb-1.5">
          <input
            type="text"
            placeholder="Search beacons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="skeuo-input w-full px-3 py-1.5 text-[11px]"
          />
        </div>

        {/* Cluster dropdown */}
        <ClusterDropdown
          value={activeCluster}
          onChange={setActiveCluster}
          allLabel={`All (${beaconList.length})`}
          options={clusters.map((c) => ({ id: c.id, label: c.label, count: c.beaconIds.size, color: c.color }))}
        />

        {/* Beacon list — inset well */}
        <div className="flex-1 overflow-y-auto mx-2 mb-2 skeuo-inset">
          <div className="p-1 space-y-0.5">
            {displayBeacons.map((b) => {
              const isSelected = selectedBeaconId === b.id;
              const cluster = beaconClusterMap[b.id];
              return (
                <button
                  key={b.id}
                  data-nav-zone="1"
                  onClick={() => onSelectBeacon(isSelected ? null : b.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all duration-100"
                  style={{
                    background: isSelected
                      ? "linear-gradient(180deg, #363640 0%, #2a2a32 100%)"
                      : "transparent",
                    borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                    boxShadow: isSelected ? "1px 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)" : "none",
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[9px] font-bold"
                    style={{
                      background: "linear-gradient(180deg, #2a2a32 0%, #222228 100%)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {(beaconProofCounts[b.id] || 0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {getBeaconDisplayName(b, beaconNames)}
                    </div>
                    <div className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>
                      {b.type} &middot; {uniqueVisitors[b.id] || 0} visitors
                    </div>
                  </div>
                  {cluster && (
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0 skeuo-led"
                      style={{ background: cluster.color, color: cluster.color }}
                      title={cluster.label}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <div className="skeuo-panel flex-1 flex flex-col overflow-hidden">
        {selectedBeacon ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div
              className="flex items-center gap-3 p-3 pb-2.5"
              style={{ borderBottom: "1px solid rgba(0,0,0,0.3)", boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
                style={{
                  background: "linear-gradient(180deg, #2a2a32 0%, #222228 100%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "var(--text-primary)",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                }}
              >
                {(beaconProofCounts[selectedBeacon.id] || 0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                  {getBeaconDisplayName(selectedBeacon, beaconNames)}
                </div>
                <div className="text-[9px] truncate" style={{ color: "var(--text-tertiary)" }}>
                  {selectedBeacon.type}
                  {beaconNames[selectedBeacon.id] && selectedBeacon.name && beaconNames[selectedBeacon.id] !== selectedBeacon.name
                    ? ` · ${selectedBeacon.name}`
                    : ""}
                  {` · ${selectedBeacon.id.substring(0, 12)}...`}
                </div>
              </div>
              {beaconClusterMap[selectedBeacon.id] && (
                <span
                  className="px-2 py-0.5 rounded-md text-[8px] font-bold"
                  style={{
                    background: `linear-gradient(180deg, ${beaconClusterMap[selectedBeacon.id].color}22 0%, ${beaconClusterMap[selectedBeacon.id].color}11 100%)`,
                    color: beaconClusterMap[selectedBeacon.id].color,
                    border: `1px solid ${beaconClusterMap[selectedBeacon.id].color}33`,
                    boxShadow: `0 0 4px ${beaconClusterMap[selectedBeacon.id].color}15`,
                  }}
                >
                  {beaconClusterMap[selectedBeacon.id].label}
                </span>
              )}
            </div>

            {/* Stats */}
            <div
              className="grid grid-cols-4 gap-2 px-3 py-2"
              style={{ borderBottom: "1px solid rgba(0,0,0,0.3)", boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}
            >
              {[
                { label: "Total Proofs", value: String(beaconProofCounts[selectedBeacon.id] || 0) },
                { label: "Unique Visitors", value: String(uniqueVisitors[selectedBeacon.id] || 0) },
                { label: "Transitions", value: String(transitionCount) },
                { label: "Avg Dwell", value: avgDwell > 0 ? `${avgDwell}m` : "—" },
              ].map((s) => (
                <div key={s.label} className="skeuo-inset px-2 py-1.5 rounded-md">
                  <div className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
                  <div className="text-[10px] font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Visitors */}
            <div className="flex-1 overflow-hidden flex flex-col px-3 py-2">
              <div className="text-[8px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-tertiary)" }}>
                Visitors ({visitors.length})
              </div>
              <div className="flex-1 overflow-y-auto skeuo-inset p-1.5">
                <div className="space-y-0.5">
                  {visitors.map((v) => (
                    <div
                      key={v.userId}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                    >
                      <Avatar
                        src={v.profile?.profilePicture}
                        name={v.profile?.displayName || v.userId}
                        size={24}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                          {v.profile?.displayName || v.userId.substring(0, 10) + "..."}
                        </div>
                        <div className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>
                          First: {formatTs(v.firstVisit)} &middot; {v.proofCount} proof{v.proofCount !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                  {visitors.length === 0 && (
                    <div className="text-[10px] text-center py-4" style={{ color: "var(--text-tertiary)" }}>
                      No visitors recorded
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: "var(--text-tertiary)" }}>
            <span className="text-[11px]">Select a beacon to see details</span>
            <span className="text-[9px]">Visitors and stats will appear here</span>
          </div>
        )}
      </div>
    </div>
  );
}
