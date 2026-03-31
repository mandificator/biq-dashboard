"use client";

import React from "react";
import { UserDetail, Beacon, Profile, LumaGuest } from "@/types";
import { useState, useMemo } from "react";
import { DwellTimeChart } from "./Charts";

const Avatar = React.memo(function Avatar({ src, name, size = 32 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initial = name[0]?.toUpperCase() || "?";
  const px = `${size}px`;

  if (!src || failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0 font-bold skeuo-inset"
        style={{ width: px, height: px, fontSize: size * 0.38, color: "var(--chart-label)", borderRadius: "50%" }}
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

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    hour: "2-digit", minute: "2-digit",
  });
}

function getBeaconDisplayName(bid: string, beacons: Record<string, Beacon>, names: Record<string, string>): string {
  if (names[bid]) return names[bid];
  return bid.substring(0, 10);
}

function UserRow({ user, isSelected, onSelect, lumaGuest }: {
  user: UserDetail;
  isSelected: boolean;
  onSelect: () => void;
  lumaGuest?: LumaGuest;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left transition-all duration-100"
      style={{
        background: isSelected
          ? "var(--selected-bg)"
          : "transparent",
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        boxShadow: isSelected ? "1px 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)" : "none",
      }}
    >
      <Avatar
        src={user.profile?.profilePicture}
        name={user.profile?.displayName || user.userId}
        size={20}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold truncate flex items-center gap-1" style={{ color: "var(--text-primary)" }}>
          {user.profile?.displayName || user.userId.substring(0, 10) + "..."}
          {lumaGuest && (
            <span
              className="text-[7px] font-bold px-1 py-0 rounded"
              style={{ background: "#a855f722", color: "#a855f7", border: "1px solid #a855f733" }}
              title={`Luma: ${lumaGuest.name} (${lumaGuest.email})`}
            >
              LU.MA
            </span>
          )}
        </div>
        <div className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>
          {formatTime(user.firstProof)}
        </div>
      </div>
    </button>
  );
}

function UserColumn({ title, count, color, icon, users, selectedUserId, onSelectUser }: {
  title: string;
  count: number;
  color: string;
  icon: string;
  users: UserDetail[];
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
}) {
  return (
    <div className="skeuo-panel flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="px-2 py-1.5 flex items-center gap-1.5" style={{ borderBottom: "1px solid rgba(0,0,0,0.3)", boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}>
        <span style={{ fontSize: "12px" }}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{title}</span>
        <span
          className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-md"
          style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
        >
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto m-1.5 skeuo-inset">
        <div className="p-1 space-y-0.5">
          {users.length === 0 ? (
            <div className="text-[9px] text-center py-4" style={{ color: "var(--text-tertiary)" }}>No users</div>
          ) : (
            users.map((u) => (
              <UserRow
                key={u.userId}
                user={u}
                isSelected={selectedUserId === u.userId}
                onSelect={() => onSelectUser(selectedUserId === u.userId ? null : u.userId)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Exported: User Detail Panel (used in page.tsx above beacon map) ──
export function UserDetailPanel({ user, beacons, beaconNames, onTimeClick, lumaGuest }: {
  user: UserDetail;
  beacons: Record<string, Beacon>;
  beaconNames: Record<string, string>;
  onTimeClick?: (time: number) => void;
  lumaGuest?: LumaGuest;
}) {
  return (
    <div className="skeuo-panel min-w-0 flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 pb-2.5"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.3)", boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}
      >
        <Avatar
          src={user.profile?.profilePicture}
          name={user.profile?.displayName || user.userId}
          size={38}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
            {user.profile?.displayName || user.userId}
          </div>
          <div className="text-[9px] truncate" style={{ color: "var(--text-tertiary)" }}>
            {user.userId}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {lumaGuest && (
            <span
              className="px-2 py-0.5 rounded-md text-[8px] font-bold"
              style={{
                background: "linear-gradient(180deg, #a855f722 0%, #a855f711 100%)",
                color: "#a855f7",
                border: "1px solid #a855f733",
              }}
              title={`Luma: ${lumaGuest.name} (${lumaGuest.email})`}
            >
              LU.MA
            </span>
          )}
          <span
            className="px-2 py-0.5 rounded-md text-[8px] font-bold"
            style={{
              background: user.status === "present"
                ? "linear-gradient(180deg, #8CC63F22 0%, #8CC63F11 100%)"
                : "linear-gradient(180deg, #F7941D22 0%, #F7941D11 100%)",
              color: user.status === "present" ? "#8CC63F" : "#F7941D",
              border: `1px solid ${user.status === "present" ? "#8CC63F33" : "#F7941D33"}`,
            }}
          >
            {user.status === "present" ? "Present" : "Left"}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div
        className="grid grid-cols-4 gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.3)", boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}
      >
        {[
          { label: "Check-in", value: formatTs(user.firstProof) },
          { label: "Last seen", value: formatTs(user.lastProof) },
          { label: "Dwell", value: formatDur(user.dwellMinutes) },
          { label: "Proofs", value: String(user.proofCount) },
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
            {user.beaconTimeline.map((entry, i) => {
              const isTransition = i > 0 && user.beaconTimeline[i - 1].beaconId !== entry.beaconId;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 rounded-md"
                  style={{
                    background: isTransition
                      ? "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)"
                      : "transparent",
                    cursor: onTimeClick ? "pointer" : undefined,
                  }}
                  onClick={() => onTimeClick?.(entry.time)}
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
  );
}

type Filter = "all" | "present" | "left" | "luma";

// ── Main UsersTab: single list with filter tabs ──
interface Props {
  users: UserDetail[];
  beacons: Record<string, Beacon>;
  beaconNames: Record<string, string>;
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
  eventStartTime: number;
  eventEndTime: number;
  dwellTimes: { userId: string; minutes: number }[];
  profiles: Record<string, Profile>;
  lumaGuests?: Record<string, LumaGuest>;
}

export default React.memo(function UsersTab({ users, selectedUserId, onSelectUser, lumaGuests }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const { all, presentCount, leftCount, lumaCount } = useMemo(() => {
    const all = [...users].sort((a, b) => a.firstProof - b.firstProof);
    const presentCount = users.filter(u => u.status === "present").length;
    const leftCount = users.filter(u => u.status === "left").length;
    const lumaCount = lumaGuests
      ? users.filter(u => lumaGuests[u.userId.toLowerCase()]).length
      : 0;
    return { all, presentCount, leftCount, lumaCount };
  }, [users, lumaGuests]);

  const filtered = useMemo(() => {
    if (filter === "all") return all;
    if (filter === "luma") return lumaGuests ? all.filter(u => lumaGuests[u.userId.toLowerCase()]) : [];
    return all.filter(u => u.status === filter);
  }, [all, filter, lumaGuests]);

  const tabs: { key: Filter; label: string; count: number; color: string }[] = [
    { key: "all", label: "All", count: all.length, color: "#0095FF" },
    { key: "present", label: "Present", count: presentCount, color: "#8CC63F" },
    { key: "left", label: "Left", count: leftCount, color: "#F7941D" },
  ];

  if (lumaGuests && Object.keys(lumaGuests).length > 0) {
    tabs.push({ key: "luma", label: "Lu.ma", count: lumaCount, color: "#a855f7" });
  }

  return (
    <div className="skeuo-panel flex-1 min-w-0 flex flex-col overflow-hidden h-full">
      {/* Filter tabs */}
      <div className="px-2 py-1.5 flex items-center gap-1" style={{ borderBottom: "1px solid rgba(0,0,0,0.3)", boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className="px-2 py-0.5 rounded-md text-[9px] font-bold transition-all"
            style={{
              background: filter === t.key ? "var(--selected-bg)" : "transparent",
              color: filter === t.key ? t.color : "var(--text-tertiary)",
              boxShadow: filter === t.key ? "var(--selected-shadow)" : "none",
            }}
          >
            {t.label} <span style={{ opacity: 0.7 }}>{t.count}</span>
          </button>
        ))}
      </div>
      {/* Luma check-in progress */}
      {lumaGuests && Object.keys(lumaGuests).length > 0 && (
        <div
          className="px-2 py-1.5 flex items-center gap-2"
          style={{ borderBottom: "1px solid rgba(0,0,0,0.2)" }}
        >
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(lumaCount / Object.keys(lumaGuests).length) * 100}%`,
                background: "linear-gradient(90deg, #a855f7, #7c3aed)",
              }}
            />
          </div>
          <span className="text-[8px] font-bold" style={{ color: "#a855f7" }}>
            {lumaCount}/{Object.keys(lumaGuests).length}
          </span>
        </div>
      )}
      {/* User list */}
      <div className="flex-1 overflow-y-auto m-1.5 skeuo-inset">
        <div className="p-1 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="text-[9px] text-center py-4" style={{ color: "var(--text-tertiary)" }}>No users</div>
          ) : (
            filtered.map((u) => (
              <UserRow
                key={u.userId}
                user={u}
                isSelected={selectedUserId === u.userId}
                onSelect={() => onSelectUser(selectedUserId === u.userId ? null : u.userId)}
                lumaGuest={lumaGuests?.[u.userId.toLowerCase()]}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
});
