"use client";

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Profile } from "@/types";

// Pinned popup state & component — rendered outside Recharts
interface PinnedData {
  label: string;
  count: number;
  userIds: string[];
  x: number;
  y: number;
}

function usePinnedPopup() {
  const [pinned, setPinned] = useState<PinnedData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const handler = (e: MouseEvent) => {
      // Close only if clicking outside both the popup and the container
      if (popupRef.current && popupRef.current.contains(e.target as Node)) return;
      setPinned(null);
    };
    // Use timeout so the click that opens doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
  }, [pinned]);

  return { pinned, setPinned, containerRef, popupRef };
}

function PinnedPopup({ pinned, popupRef, containerRef, profiles, onClickUser, color, noun }: {
  pinned: PinnedData;
  popupRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  profiles: Record<string, Profile>;
  onClickUser: (userId: string) => void;
  color: string;
  noun: string;
}) {
  // Clamp position so popup stays within the container
  const [pos, setPos] = React.useState({ left: pinned.x, top: pinned.y });
  const layoutRef = useRef(false);

  useEffect(() => {
    layoutRef.current = false;
  }, [pinned.x, pinned.y]);

  useEffect(() => {
    if (layoutRef.current) return;
    const popup = popupRef.current;
    const container = containerRef.current;
    if (!popup || !container) return;
    layoutRef.current = true;

    const cRect = container.getBoundingClientRect();
    const pRect = popup.getBoundingClientRect();
    const pad = 4;

    let left = pinned.x;
    let top = pinned.y - 8 - pRect.height; // above the point by default

    // If it goes above the container, flip below
    if (top < pad) {
      top = pinned.y + 12;
    }
    // If it goes below the container, clamp
    if (top + pRect.height > cRect.height - pad) {
      top = cRect.height - pRect.height - pad;
    }
    // Clamp top minimum
    if (top < pad) top = pad;

    // Horizontal: center on x, but clamp within container
    left = left - pRect.width / 2;
    if (left < pad) left = pad;
    if (left + pRect.width > cRect.width - pad) left = cRect.width - pRect.width - pad;

    setPos({ left, top });
  });

  return (
    <div
      ref={popupRef}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        ...tooltipContentStyle,
        zIndex: 100,
        minWidth: 160,
        maxHeight: 200,
        overflowY: "auto",
      }}
    >
      <div style={{ color: "#9a9aa6", fontSize: 9, marginBottom: 4 }}>{pinned.label}</div>
      <div style={{ color, fontSize: 12, fontWeight: 700, marginBottom: pinned.userIds.length > 0 ? 6 : 0 }}>
        {pinned.count} {noun}
      </div>
      {pinned.userIds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {pinned.userIds.map((uid) => {
            const p = profiles[uid];
            const name = p?.displayName || uid.substring(0, 10);
            return (
              <div
                key={uid}
                onClick={() => onClickUser(uid)}
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "2px 4px", borderRadius: 4 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <MiniAvatar src={p?.profilePicture} name={name} size={16} />
                <span style={{ fontSize: 10, color: "#e8e8ec" }}>{name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface TimelinePoint {
  time: number;
  count: number;
  userIds: string[];
}

interface DwellPoint {
  userId: string;
  minutes: number;
}

const tooltipContentStyle = {
  background: "linear-gradient(180deg, #2a2a30 0%, #222226 100%)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#e8e8ec",
  fontSize: 11,
  fontFamily: "var(--font-space-mono), monospace",
  padding: "8px 12px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.5), 1px 1px 2px rgba(0,0,0,0.3)",
};

function needsDate(data: { time: number }[]): boolean {
  if (data.length < 2) return false;
  const first = new Date(data[0].time * 1000);
  const last = new Date(data[data.length - 1].time * 1000);
  return first.getDate() !== last.getDate() || first.getMonth() !== last.getMonth();
}

function formatLabel(ts: number, showDate: boolean): string {
  const d = new Date(ts * 1000);
  if (showDate) {
    return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDur(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Avatar (small, for tooltips and dwell list)
function MiniAvatar({ src, name, size = 20 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = React.useState(false);
  const px = `${size}px`;
  if (!src || failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0 font-bold skeuo-inset"
        style={{ width: px, height: px, fontSize: size * 0.38, color: "#9a9aa6", borderRadius: "50%" }}
      >
        {name[0]?.toUpperCase() || "?"}
      </div>
    );
  }
  return (
    <img
      src={src} alt="" referrerPolicy="no-referrer" crossOrigin="anonymous"
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: px, height: px, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)" }}
      onError={() => setFailed(true)}
    />
  );
}


export const CheckInChart = React.memo(function CheckInChart({
  data, profiles, onClickUser,
}: {
  data: TimelinePoint[];
  profiles: Record<string, Profile>;
  onClickUser: (userId: string) => void;
}) {
  const showDate = needsDate(data);
  const chartData = useMemo(() => data.map((d) => ({
    time: formatLabel(d.time, showDate),
    value: d.count,
    userIds: d.userIds,
  })), [data, showDate]);
  const { pinned, setPinned, containerRef, popupRef } = usePinnedPopup();

  return (
    <div className="skeuo-panel h-full flex flex-col overflow-hidden relative" ref={containerRef}>
      <div className="px-4 pt-3 pb-1">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          Check-ins
        </span>
      </div>
      <div className="flex-1 min-h-0 mx-3 mb-3 skeuo-inset overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 12, bottom: 4, left: -16 }}
            onClick={(state) => {
              if (!state || typeof state.activeTooltipIndex !== 'number') return;
              const idx = state.activeTooltipIndex;
              const point = chartData[idx];
              if (!point || point.userIds.length === 0) return;
              const coords = state.activeCoordinate;
              if (!coords) return;
              // Offset by chart margins + panel padding
              setPinned({ label: point.time, count: point.value, userIds: point.userIds, x: coords.x + 12 + 16, y: coords.y + 10 + 28 });
            }}>
            <defs>
              <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0095FF" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#0095FF" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fill: "#66666e", fontSize: 9, fontFamily: "var(--font-space-mono)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#66666e", fontSize: 9, fontFamily: "var(--font-space-mono)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            {!pinned && <Tooltip contentStyle={tooltipContentStyle} itemStyle={{ color: "#e8e8ec", fontSize: 10 }} labelStyle={{ color: "#9a9aa6", fontSize: 9 }} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />}
            <Area type="monotone" dataKey="value" name="Check-ins" stroke="#0095FF" fill="url(#ciGrad)" strokeWidth={2}
              dot={{ r: 3, fill: "#0095FF", stroke: "none", cursor: "pointer" }}
              activeDot={{ r: 5, fill: "#0095FF", stroke: "#fff", strokeWidth: 1.5, cursor: "pointer" }}
              isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {pinned && <PinnedPopup pinned={pinned} popupRef={popupRef} containerRef={containerRef} profiles={profiles} onClickUser={onClickUser} color="#0095FF" noun="check-ins" />}
    </div>
  );
});

export const CheckOutChart = React.memo(function CheckOutChart({
  data, profiles, onClickUser,
}: {
  data: TimelinePoint[];
  profiles: Record<string, Profile>;
  onClickUser: (userId: string) => void;
}) {
  const showDate = needsDate(data);
  const chartData = useMemo(() => data.map((d) => ({
    time: formatLabel(d.time, showDate),
    value: d.count,
    userIds: d.userIds,
  })), [data, showDate]);
  const { pinned, setPinned, containerRef, popupRef } = usePinnedPopup();

  return (
    <div className="skeuo-panel h-full flex flex-col overflow-hidden relative" ref={containerRef}>
      <div className="px-4 pt-3 pb-1">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          Check-outs
        </span>
      </div>
      <div className="flex-1 min-h-0 mx-3 mb-3 skeuo-inset overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 12, bottom: 4, left: -16 }}
            onClick={(state) => {
              if (!state || typeof state.activeTooltipIndex !== 'number') return;
              const idx = state.activeTooltipIndex;
              const point = chartData[idx];
              if (!point || point.userIds.length === 0) return;
              const coords = state.activeCoordinate;
              if (!coords) return;
              setPinned({ label: point.time, count: point.value, userIds: point.userIds, x: coords.x + 12 + 16, y: coords.y + 10 + 28 });
            }}>
            <defs>
              <linearGradient id="coGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F7941D" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#F7941D" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fill: "#66666e", fontSize: 9, fontFamily: "var(--font-space-mono)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#66666e", fontSize: 9, fontFamily: "var(--font-space-mono)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            {!pinned && <Tooltip contentStyle={tooltipContentStyle} itemStyle={{ color: "#e8e8ec", fontSize: 10 }} labelStyle={{ color: "#9a9aa6", fontSize: 9 }} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />}
            <Area type="monotone" dataKey="value" name="Check-outs" stroke="#F7941D" fill="url(#coGrad)" strokeWidth={2}
              dot={{ r: 3, fill: "#F7941D", stroke: "none", cursor: "pointer" }}
              activeDot={{ r: 5, fill: "#F7941D", stroke: "#fff", strokeWidth: 1.5, cursor: "pointer" }}
              isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {pinned && <PinnedPopup pinned={pinned} popupRef={popupRef} containerRef={containerRef} profiles={profiles} onClickUser={onClickUser} color="#F7941D" noun="check-outs" />}
    </div>
  );
});

export const DwellTimeChart = React.memo(function DwellTimeChart({
  data, profiles, onClickUser,
}: {
  data: DwellPoint[];
  profiles: Record<string, Profile>;
  onClickUser: (userId: string) => void;
}) {
  const [sortAsc, setSortAsc] = useState(false);

  const sortedData = useMemo(() => {
    const sorted = [...data].sort((a, b) => sortAsc ? a.minutes - b.minutes : b.minutes - a.minutes);
    return sorted;
  }, [data, sortAsc]);

  const maxMinutes = useMemo(() => Math.max(1, ...data.map(d => d.minutes)), [data]);

  return (
    <div className="skeuo-panel h-full flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          Dwell Time
        </span>
        <button
          onClick={() => setSortAsc(!sortAsc)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors"
          style={{ color: "var(--text-tertiary)", background: "rgba(255,255,255,0.04)" }}
          title={sortAsc ? "Ascending — click to sort descending" : "Descending — click to sort ascending"}
        >
          {sortAsc ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 8V2M5 2L2.5 4.5M5 2L7.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 2V8M5 8L2.5 5.5M5 8L7.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {sortAsc ? "ASC" : "DESC"}
        </button>
      </div>
      <div className="flex-1 min-h-0 mx-3 mb-3 skeuo-inset overflow-y-auto">
        <div className="p-1.5 space-y-0.5">
          {sortedData.map((d) => {
            const p = profiles[d.userId];
            const name = p?.displayName || d.userId.substring(0, 10);
            const barWidth = Math.max(2, (d.minutes / maxMinutes) * 100);
            return (
              <button
                key={d.userId}
                onClick={() => onClickUser(d.userId)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-left transition-all duration-100 group"
                style={{ background: "transparent" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <MiniAvatar src={p?.profilePicture} name={name} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-bold truncate" style={{ color: "var(--text-primary)", maxWidth: "60%" }}>
                      {name}
                    </span>
                    <span className="text-[9px] font-bold flex-shrink-0" style={{ color: "#8CC63F" }}>
                      {formatDur(d.minutes)}
                    </span>
                  </div>
                  <div className="w-full h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${barWidth}%`, background: "#8CC63F", opacity: 0.8 }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
