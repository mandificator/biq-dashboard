"use client";

import React, { useState, useMemo } from "react";
import { CrossEventAnalysis, ProcessedData, Profile } from "@/types";

const COLORS = ["#0095FF", "#00D4F5", "#F7941D", "#8CC63F", "#7B5EA7"];

function formatDur(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface LiveDashboardProps {
  analysis: CrossEventAnalysis;
  loadedData: Map<string, ProcessedData>;
  eventNames: Record<string, string>;
  eventDates: Record<string, number>;
}

const Avatar = React.memo(function Avatar({ src, name, size = 22 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initial = name[0]?.toUpperCase() || "?";
  const px = `${size}px`;
  if (!src || failed) {
    return (
      <div className="rounded-full flex items-center justify-center flex-shrink-0 font-bold skeuo-inset"
        style={{ width: px, height: px, fontSize: size * 0.38, color: "var(--text-secondary)", borderRadius: "50%" }}>
        {initial}
      </div>
    );
  }
  return (
    <img src={src} alt="" referrerPolicy="no-referrer" crossOrigin="anonymous"
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: px, height: px, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.4)" }}
      onError={() => setFailed(true)} />
  );
});

export default function LiveDashboard({ analysis, loadedData, eventNames, eventDates }: LiveDashboardProps) {
  const [userEventFilter, setUserEventFilter] = useState<number | null>(null);

  const sortedMetrics = useMemo(() => {
    const items = analysis.eventMetrics.map((em, i) => ({ ...em, origIndex: i }));
    items.sort((a, b) => (eventDates[a.eventId] || 0) - (eventDates[b.eventId] || 0));
    return items;
  }, [analysis.eventMetrics, eventDates]);

  const allProfiles = useMemo(() => {
    const profiles: Record<string, Profile> = {};
    for (const [, data] of loadedData) Object.assign(profiles, data.profiles);
    return profiles;
  }, [loadedData]);

  const maxEventCount = useMemo(() => {
    return Math.max(...analysis.sharedUsers.map((u) => u.eventIds.length), 1);
  }, [analysis.sharedUsers]);

  const filteredUsers = useMemo(() => {
    if (userEventFilter === null) return analysis.sharedUsers;
    return analysis.sharedUsers.filter((u) => u.eventIds.length === userEventFilter);
  }, [analysis.sharedUsers, userEventFilter]);

  // ── Bar chart data for Attendees, Dwell, Peak ──
  const barMetrics = useMemo(() => {
    const events = sortedMetrics.map((em) => ({
      eventId: em.eventId,
      name: eventNames[em.eventId] || em.eventName,
      color: COLORS[em.origIndex % COLORS.length],
      attendees: em.totalAttendees,
      dwell: em.avgDwellMinutes,
      peak: em.peakConcurrent,
    }));
    return {
      events,
      maxAttendees: Math.max(...events.map((e) => e.attendees), 1),
      maxDwell: Math.max(...events.map((e) => e.dwell), 1),
      maxPeak: Math.max(...events.map((e) => e.peak), 1),
    };
  }, [sortedMetrics, eventNames]);


  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* ── Top row: bars left, users right ── */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Left: Attendees / Dwell / Peak in separate panels */}
        <div className="flex flex-col gap-3 flex-1 min-w-0 min-h-0">
          {([
            { key: "attendees" as const, label: "Attendees", max: barMetrics.maxAttendees, fmt: (v: number) => String(v) },
            { key: "dwell" as const, label: "Avg Dwell", max: barMetrics.maxDwell, fmt: (v: number) => formatDur(v) },
            { key: "peak" as const, label: "Peak Concurrent", max: barMetrics.maxPeak, fmt: (v: number) => String(v) },
          ]).map((metric) => (
            <div key={metric.key} className="skeuo-panel p-3 flex flex-col flex-1 min-h-0">
              <div className="text-[9px] font-bold uppercase tracking-wider mb-1.5 flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
                {metric.label}
              </div>
              <div className="flex flex-col justify-start gap-[2px] flex-1 min-h-0 overflow-auto">
                {barMetrics.events.map((ev) => {
                  const value = ev[metric.key];
                  const pct = Math.round((value / metric.max) * 100);
                  return (
                    <div key={ev.eventId} className="flex flex-col gap-0.5 flex-shrink-0">
                      <span className="text-[8px] font-bold" style={{ color: ev.color }}>
                        {ev.name}
                      </span>
                      <div className="w-full min-w-0 rounded-sm overflow-hidden relative" style={{ background: "var(--overlay-subtle)", height: 32 }}>
                        <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${Math.max(pct, 1)}%`, background: ev.color, opacity: 0.85 }} />
                        <span className="absolute inset-0 flex items-center px-1.5 text-[8px] font-bold tabular-nums" style={{ color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                          {metric.fmt(value)} <span className="ml-0.5" style={{ opacity: 0.7 }}>({pct}%)</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right: Users list */}
        <div className="skeuo-panel p-3 flex flex-col flex-1 min-w-0 min-h-0">
          <div className="flex items-center gap-1.5 mb-2 flex-shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-wider flex-1" style={{ color: "var(--text-tertiary)" }}>
              Users ({filteredUsers.length})
            </span>
            <button
              onClick={() => setUserEventFilter(null)}
              className="text-[8px] font-bold px-1.5 py-0.5 rounded skeuo-btn"
              style={{ color: userEventFilter === null ? "var(--text-primary)" : "var(--text-secondary)" }}>
              All
            </button>
            {Array.from({ length: maxEventCount }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setUserEventFilter(userEventFilter === n ? null : n)}
                className="text-[8px] font-bold px-1.5 py-0.5 rounded skeuo-btn"
                style={{ color: userEventFilter === n ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {n}ev
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {filteredUsers.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <span className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>No users</span>
              </div>
            )}
            {filteredUsers.slice(0, 50).map((user, idx) => {
              const profile = allProfiles[user.userId];
              const rawName = profile?.displayName || user.userId.substring(0, 14) + "...";
              const name = rawName.length > 15 ? rawName.substring(0, 15) + "…" : rawName;
              return (
                <div key={user.userId} className="flex items-center py-1 px-1"
                  style={{ borderBottom: idx < Math.min(filteredUsers.length, 50) - 1 ? "1px solid var(--overlay-subtle)" : undefined }}>
                  <Avatar src={profile?.profilePicture} name={name} size={20} />
                  <span className="text-[9px] font-bold truncate flex-shrink-0 ml-1.5" style={{ color: "var(--text-primary)", width: 95 }}>
                    {name}
                  </span>
                  <div className="flex-1" />
                  <div className="flex flex-shrink-0">
                    {analysis.eventMetrics.map((em, i) => {
                      const attended = user.eventIds.includes(em.eventId);
                      return (
                        <div key={em.eventId} style={{ width: 10, height: 10, display: "flex", alignItems: "center" }}>
                          <div className="rounded-full"
                            title={eventNames[em.eventId] || em.eventId}
                            style={{ width: 7, height: 7, background: attended ? COLORS[i % COLORS.length] : "var(--dot-inactive)" }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex-1" />
                  <span className="text-[8px] font-bold flex-shrink-0 text-right" style={{ color: "var(--accent)", width: 22 }}>
                    {user.eventIds.length} ev
                  </span>
                  <span className="text-[8px] font-bold flex-shrink-0 text-right" style={{ color: "var(--text-secondary)", width: 28, marginLeft: 6 }}>
                    {user.totalProofs}p
                  </span>
                  <span className="text-[8px] font-bold flex-shrink-0 text-right" style={{ color: "var(--text-tertiary)", width: 42, marginLeft: 6, whiteSpace: "nowrap" }}>
                    {formatDur(user.totalDwell)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom center: User Overlap ── */}
      <div className="skeuo-panel p-3 flex flex-col flex-shrink-0">
        <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
          User Overlap
        </div>
        <div className="overflow-auto">
          {(() => {
            const n = analysis.eventMetrics.length;
            const maxChars = n <= 2 ? 30 : n <= 3 ? 20 : n <= 5 ? 12 : 8;
            const truncName = (name: string) => name.length > maxChars ? name.substring(0, maxChars - 1) + "…" : name;
            return (
              <table className="text-[8px] w-full" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th />
                    {analysis.eventMetrics.map((em, i) => (
                      <th key={em.eventId} className="px-1 py-0.5 text-center font-bold" title={em.eventName}
                        style={{ color: COLORS[i % COLORS.length] }}>
                        {truncName(em.eventName)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.eventMetrics.map((row, ri) => (
                    <tr key={row.eventId}>
                      <td className="px-1 py-0.5 font-bold text-right whitespace-nowrap" title={row.eventName}
                        style={{ color: COLORS[ri % COLORS.length] }}>
                        {truncName(row.eventName)}
                      </td>
                      {analysis.eventMetrics.map((col, ci) => {
                        if (ri === ci) return (
                          <td key={col.eventId} className="px-1 py-0.5 text-center" style={{ color: "var(--text-tertiary)" }}>
                            {row.totalAttendees}
                          </td>
                        );
                        const overlap = analysis.overlapMatrix.find((o) =>
                          (o.eventA === row.eventId && o.eventB === col.eventId) ||
                          (o.eventA === col.eventId && o.eventB === row.eventId)
                        );
                        const count = overlap?.sharedCount ?? 0;
                        const pct = row.totalAttendees > 0 ? Math.round((count / row.totalAttendees) * 100) : 0;
                        return (
                          <td key={col.eventId} className="px-1 py-0.5 text-center font-bold"
                            title={`${count} shared (${pct}%)`}
                            style={{
                              color: count > 0 ? "var(--text-primary)" : "var(--text-tertiary)",
                              background: count > 0 ? `rgba(0,149,255,${Math.min(0.25, pct / 150)})` : "transparent",
                              borderRadius: 3,
                            }}>
                            {count > 0 ? <>{count} <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontSize: 7 }}>({pct}%)</span></> : "0"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
