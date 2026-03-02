"use client";

import React from "react";
import { UserDetail, Beacon } from "@/types";
import { useState, useMemo, useRef, useEffect } from "react";

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
  users: UserDetail[];
  beacons: Record<string, Beacon>;
  beaconNames: Record<string, string>;
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
  eventStartTime: number;
  eventEndTime: number;
}

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDur(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getBeaconDisplayName(bid: string, beacons: Record<string, Beacon>, names: Record<string, string>): string {
  if (names[bid]) return names[bid];
  return beacons[bid]?.name || bid.substring(0, 10);
}

interface Cluster {
  id: string;
  label: string;
  color: string;
  icon: string;
  users: UserDetail[];
  description: string;
}

function clusterUsers(users: UserDetail[], eventStart: number, eventEnd: number): Cluster[] {
  if (users.length === 0) return [];

  const avgDwell = users.reduce((s, u) => s + u.dwellMinutes, 0) / users.length;
  const eventDuration = (eventEnd - eventStart) / 60;
  const shortThreshold = Math.min(30, avgDwell * 0.3);
  const earlyThreshold = eventStart + eventDuration * 0.25;
  const lateThreshold = eventStart + eventDuration * 0.6;

  const engaged: UserDetail[] = [];
  const quickVisits: UserDetail[] = [];
  const earlyBirds: UserDetail[] = [];
  const lateArrivals: UserDetail[] = [];
  const explorers: UserDetail[] = [];
  const singleBeacon: UserDetail[] = [];

  for (const u of users) {
    const isShort = u.dwellMinutes <= shortThreshold;
    const isEarly = u.firstProof <= earlyThreshold;
    const isLate = u.firstProof >= lateThreshold;
    const isExplorer = u.beaconsVisited.length >= 3;
    const isEngaged = u.dwellMinutes >= avgDwell * 1.5 && u.beaconsVisited.length >= 2;
    const isSingle = u.beaconsVisited.length === 1 && !isShort;

    if (isEngaged) engaged.push(u);
    else if (isShort) quickVisits.push(u);
    else if (isExplorer) explorers.push(u);
    else if (isSingle) singleBeacon.push(u);
    else if (isEarly) earlyBirds.push(u);
    else if (isLate) lateArrivals.push(u);
  }

  const assigned = new Set([
    ...engaged.map(u => u.userId),
    ...quickVisits.map(u => u.userId),
    ...explorers.map(u => u.userId),
    ...singleBeacon.map(u => u.userId),
    ...earlyBirds.map(u => u.userId),
    ...lateArrivals.map(u => u.userId),
  ]);
  const rest = users.filter(u => !assigned.has(u.userId));

  const clusters: Cluster[] = [];

  if (engaged.length > 0) clusters.push({
    id: "engaged", label: "Most Engaged", color: "#00D4F5", icon: "star",
    users: engaged, description: "Long dwell time, multiple beacons",
  });
  if (explorers.length > 0) clusters.push({
    id: "explorers", label: "Explorers", color: "#8CC63F", icon: "compass",
    users: explorers, description: "Visited 3+ beacons",
  });
  if (earlyBirds.length > 0) clusters.push({
    id: "early", label: "Early Birds", color: "#0095FF", icon: "sunrise",
    users: earlyBirds, description: "Arrived in first 25% of event",
  });
  if (lateArrivals.length > 0) clusters.push({
    id: "late", label: "Late Arrivals", color: "#F7941D", icon: "clock",
    users: lateArrivals, description: "Arrived after 60% of event",
  });
  if (quickVisits.length > 0) clusters.push({
    id: "quick", label: "Quick Visits", color: "#8CC63F", icon: "zap",
    users: quickVisits, description: `Stayed < ${Math.round(shortThreshold)}min`,
  });
  if (singleBeacon.length > 0) clusters.push({
    id: "single", label: "Single Beacon", color: "#9a9aa6", icon: "pin",
    users: singleBeacon, description: "Only visited 1 beacon",
  });
  if (rest.length > 0) clusters.push({
    id: "other", label: "Regular", color: "#66666e", icon: "user",
    users: rest, description: "Standard attendance pattern",
  });

  return clusters;
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

export default function UsersTab({ users, beacons, beaconNames, selectedUserId, onSelectUser, eventStartTime, eventEndTime }: Props) {
  const [search, setSearch] = useState("");
  const [activeCluster, setActiveCluster] = useState<string | null>(null);

  const clusters = useMemo(
    () => clusterUsers(users, eventStartTime, eventEndTime),
    [users, eventStartTime, eventEndTime]
  );

  const displayUsers = useMemo(() => {
    let list = activeCluster
      ? clusters.find(c => c.id === activeCluster)?.users || users
      : users;

    if (search) {
      list = list.filter((u) => {
        const name = u.profile?.displayName || u.userId;
        return name.toLowerCase().includes(search.toLowerCase());
      });
    }

    return [...list].sort((a, b) => b.lastProof - a.lastProof);
  }, [users, clusters, activeCluster, search]);

  const selected = selectedUserId ? users.find((u) => u.userId === selectedUserId) : null;

  return (
    <div className="flex gap-3 h-full">
      {/* User list with clusters */}
      <div className="skeuo-panel w-[200px] flex-shrink-0 flex flex-col overflow-hidden">
        {/* Search */}
        <div className="p-2 pb-1.5">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="skeuo-input w-full px-3 py-1.5 text-[11px]"
          />
        </div>

        {/* Cluster dropdown */}
        <ClusterDropdown
          value={activeCluster}
          onChange={setActiveCluster}
          allLabel={`All (${users.length})`}
          options={clusters.map((c) => ({ id: c.id, label: c.label, count: c.users.length, color: c.color }))}
        />

        {/* User list — inset well */}
        <div className="flex-1 overflow-y-auto mx-2 mb-2 skeuo-inset">
          <div className="p-1 space-y-0.5">
            {displayUsers.map((u) => {
              const userCluster = clusters.find(c => c.users.some(cu => cu.userId === u.userId));
              const isSelected = selectedUserId === u.userId;
              return (
                <button
                  key={u.userId}
                  data-nav-zone="1"
                  onClick={() => onSelectUser(isSelected ? null : u.userId)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all duration-100"
                  style={{
                    background: isSelected
                      ? "linear-gradient(180deg, #363640 0%, #2a2a32 100%)"
                      : "transparent",
                    borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                    boxShadow: isSelected ? "1px 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)" : "none",
                  }}
                >
                  <Avatar
                    src={u.profile?.profilePicture}
                    name={u.profile?.displayName || u.userId}
                    size={24}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {u.profile?.displayName || u.userId.substring(0, 10) + "..."}
                    </div>
                    <div className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>
                      {formatDur(u.dwellMinutes)} &middot; {u.beaconsVisited.length}b &middot; {u.proofCount}p
                    </div>
                  </div>
                  {userCluster && (
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0 skeuo-led"
                      style={{ background: userCluster.color, color: userCluster.color }}
                      title={userCluster.label}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail */}
      <div className="skeuo-panel flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div
              className="flex items-center gap-3 p-3 pb-2.5"
              style={{ borderBottom: "1px solid rgba(0,0,0,0.3)", boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}
            >
              <Avatar
                src={selected.profile?.profilePicture}
                name={selected.profile?.displayName || selected.userId}
                size={38}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                  {selected.profile?.displayName || selected.userId}
                </div>
                <div className="text-[9px] truncate" style={{ color: "var(--text-tertiary)" }}>
                  {selected.userId}
                </div>
              </div>
              {(() => {
                const c = clusters.find(cl => cl.users.some(u => u.userId === selected.userId));
                return c ? (
                  <span
                    className="px-2 py-0.5 rounded-md text-[8px] font-bold"
                    style={{
                      background: `linear-gradient(180deg, ${c.color}22 0%, ${c.color}11 100%)`,
                      color: c.color,
                      border: `1px solid ${c.color}33`,
                      boxShadow: `0 0 4px ${c.color}15`,
                    }}
                  >
                    {c.label}
                  </span>
                ) : null;
              })()}
            </div>

            {/* Stats */}
            <div
              className="grid grid-cols-4 gap-2 px-3 py-2"
              style={{ borderBottom: "1px solid rgba(0,0,0,0.3)", boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}
            >
              {[
                { label: "Check-in", value: formatTs(selected.firstProof) },
                { label: "Last seen", value: formatTs(selected.lastProof) },
                { label: "Dwell", value: formatDur(selected.dwellMinutes) },
                { label: "Proofs", value: String(selected.proofCount) },
              ].map((s) => (
                <div key={s.label} className="skeuo-inset px-2 py-1.5 rounded-md">
                  <div className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
                  <div className="text-[10px] font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-hidden flex flex-col px-3 py-2">
              <div className="text-[8px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-tertiary)" }}>Timeline</div>
              <div className="flex-1 overflow-y-auto skeuo-inset p-1.5">
                <div className="space-y-0.5">
                  {selected.beaconTimeline.map((entry, i) => {
                    const isTransition = i > 0 && selected.beaconTimeline[i - 1].beaconId !== entry.beaconId;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-2 py-1 rounded-md"
                        style={{
                          background: isTransition
                            ? "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)"
                            : "transparent",
                        }}
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            background: isTransition ? "var(--text-tertiary)" : "#44444a",
                            boxShadow: isTransition ? "0 0 4px var(--text-tertiary)" : "none",
                          }}
                        />
                        <span className="text-[8px] w-28 flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
                          {formatTs(entry.time)}
                        </span>
                        <span className="text-[10px] font-bold" style={{ color: "var(--text-primary)" }}>
                          {getBeaconDisplayName(entry.beaconId, beacons, beaconNames)}
                        </span>
                        {isTransition && (
                          <span className="text-[8px] ml-auto font-bold" style={{ color: "var(--text-tertiary)" }}>moved</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: "var(--text-tertiary)" }}>
            <span className="text-[11px]">Select a user to see details</span>
            <span className="text-[9px]">Journey will appear on the beacon map</span>
          </div>
        )}
      </div>
    </div>
  );
}
