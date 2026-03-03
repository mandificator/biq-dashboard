"use client";

import React, { useState, useMemo } from "react";
import {
  Tooltip, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie,
} from "recharts";
import { CrossEventAnalysis, ProcessedData, Profile } from "@/types";

const COLORS = ["#0095FF", "#00D4F5", "#F7941D", "#8CC63F", "#7B5EA7"];

const TOOLTIP_STYLE = {
  background: "linear-gradient(180deg, #2a2a30 0%, #242428 100%)",
  border: "1px solid #4a4a52",
  borderRadius: 8,
  fontSize: 10,
  color: "#e8e8ec",
  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
};

function formatDur(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

type LegendSort = "event" | "users" | "dwell" | "proofs";

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
        style={{ width: px, height: px, fontSize: size * 0.38, color: "#9a9aa6", borderRadius: "50%" }}>
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
  const [legendSort, setLegendSort] = useState<LegendSort>("event");
  const [legendSortAsc, setLegendSortAsc] = useState(true);

  const handleLegendSort = (col: LegendSort) => {
    if (legendSort === col) setLegendSortAsc((v) => !v);
    else { setLegendSort(col); setLegendSortAsc(col === "event"); }
  };

  const sortedMetrics = useMemo(() => {
    const items = analysis.eventMetrics.map((em, i) => ({ ...em, origIndex: i }));
    items.sort((a, b) => {
      let cmp = 0;
      switch (legendSort) {
        case "event": cmp = (eventDates[a.eventId] || 0) - (eventDates[b.eventId] || 0); break;
        case "users": cmp = a.totalAttendees - b.totalAttendees; break;
        case "dwell": cmp = a.avgDwellMinutes - b.avgDwellMinutes; break;
        case "proofs": cmp = a.totalProofs - b.totalProofs; break;
      }
      return legendSortAsc ? cmp : -cmp;
    });
    return items;
  }, [analysis.eventMetrics, legendSort, legendSortAsc, eventDates]);

  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    analysis.eventMetrics.forEach((em, i) => { m[em.eventId] = COLORS[i % COLORS.length]; });
    return m;
  }, [analysis.eventMetrics]);

  const allProfiles = useMemo(() => {
    const profiles: Record<string, Profile> = {};
    for (const [, data] of loadedData) Object.assign(profiles, data.profiles);
    return profiles;
  }, [loadedData]);

  // ── Radar chart data — normalized to 0-100 ──
  const radarData = useMemo(() => {
    const metrics = ["totalAttendees", "avgDwellMinutes", "totalProofs", "uniqueBeacons", "peakConcurrent"] as const;
    const labels = ["Attendees", "Dwell", "Proofs", "Beacons", "Peak"];

    // Find max per metric for normalization
    const maxes = metrics.map((m) => Math.max(...analysis.eventMetrics.map((em) => em[m]), 1));

    return labels.map((label, li) => {
      const point: Record<string, string | number> = { metric: label };
      analysis.eventMetrics.forEach((em, ei) => {
        point[em.eventId] = Math.round((em[metrics[li]] / maxes[li]) * 100);
      });
      return point;
    });
  }, [analysis.eventMetrics]);

  // ── Retention donut — returning vs unique-only ──
  const retentionData = useMemo(() => {
    const totalUnique = new Set<string>();
    for (const em of analysis.eventMetrics) {
      const data = loadedData.get(em.eventId);
      if (data) data.userDetails.forEach((u) => totalUnique.add(u.userId));
    }
    const returning = analysis.sharedUsers.length;
    const uniqueOnly = totalUnique.size - returning;
    return [
      { name: "Returning", value: returning, color: "#0095FF" },
      { name: "Single Event", value: uniqueOnly, color: "#3a3a42" },
    ];
  }, [analysis, loadedData]);
  const retentionPct = retentionData[0].value + retentionData[1].value > 0
    ? Math.round((retentionData[0].value / (retentionData[0].value + retentionData[1].value)) * 100)
    : 0;

  return (
    <div className="h-full flex gap-3 overflow-hidden">
      {/* ── Left 50%: Multi-Metric Profile radar ── */}
      <div className="skeuo-panel p-4 flex flex-col flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2 flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
          Multi-Metric Profile
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#c0c0c8", fontSize: 11, fontWeight: 700 }} />
              <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
              {analysis.eventMetrics.map((em, i) => (
                <Radar key={em.eventId} name={em.eventName} dataKey={em.eventId}
                  stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
              ))}
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const sorted = [...payload].sort((a, b) => ((b.value as number) || 0) - ((a.value as number) || 0));
                return (
                  <div style={{ ...TOOLTIP_STYLE, padding: "6px 10px" }}>
                    <div style={{ fontSize: 9, color: "#9a9aa6", marginBottom: 4 }}>{label}</div>
                    {sorted.map((entry) => (
                      <div key={entry.dataKey as string} style={{ fontSize: 10, color: entry.color as string, fontWeight: 700, lineHeight: "16px" }}>
                        {entry.value} — {entry.name}
                      </div>
                    ))}
                  </div>
                );
              }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        {/* Legend + Breakdown */}
        <div className="flex flex-col gap-1 mt-2 pt-2 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Header — clickable to sort */}
          <div className="flex items-center mb-0.5">
            <div style={{ width: 10 }} />
            {([
              { key: "event" as LegendSort, label: "Event", width: undefined, ml: 8 },
              { key: "users" as LegendSort, label: "Users", width: 36, ml: 0 },
              { key: "dwell" as LegendSort, label: "Dwell", width: 36, ml: 8 },
              { key: "proofs" as LegendSort, label: "Proofs", width: 42, ml: 8 },
            ]).map((col) => (
              <span key={col.key}
                onClick={() => handleLegendSort(col.key)}
                className={`text-[7px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors ${col.key === "event" ? "flex-1 min-w-0 ml-2" : "text-right flex-shrink-0"}`}
                style={{
                  color: legendSort === col.key ? "var(--text-primary)" : "var(--text-tertiary)",
                  width: col.width,
                  marginLeft: col.key !== "event" ? col.ml : undefined,
                }}>
                {legendSort === col.key && col.key !== "event" && <span style={{ fontSize: 4, marginRight: 1 }}>{legendSortAsc ? "▲" : "▼"}</span>}{col.label}{legendSort === col.key && col.key === "event" && <span style={{ fontSize: 4, marginLeft: 1 }}>{legendSortAsc ? "▲" : "▼"}</span>}
              </span>
            ))}
          </div>
          {sortedMetrics.map((em) => (
            <div key={em.eventId} className="flex items-center">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[em.origIndex % COLORS.length] }} />
              <span className="text-[9px] font-bold truncate ml-2 flex-1 min-w-0" style={{ color: COLORS[em.origIndex % COLORS.length] }}>
                {em.eventName}
              </span>
              <span className="text-[9px] font-bold flex-shrink-0 text-right" style={{ color: "var(--text-primary)", width: 36 }}>
                {em.totalAttendees}
              </span>
              <span className="text-[9px] font-bold flex-shrink-0 text-right" style={{ color: "var(--text-primary)", width: 36, marginLeft: 8 }}>
                {em.avgDwellMinutes}m
              </span>
              <span className="text-[9px] font-bold flex-shrink-0 text-right" style={{ color: "var(--text-primary)", width: 42, marginLeft: 8 }}>
                {em.totalProofs.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right 50%: two rows ── */}
      <div className="flex flex-col gap-3 flex-1 min-w-0 min-h-0">
        {/* Top: Users list + Retention */}
        <div className="skeuo-panel p-3 flex gap-3 flex-1 min-h-0">
          {/* Users list */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0">
            <div className="text-[9px] font-bold uppercase tracking-wider mb-2 flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
              Returning Users ({analysis.sharedUsers.length})
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {analysis.sharedUsers.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <span className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>No shared users yet</span>
                </div>
              )}
              {analysis.sharedUsers.slice(0, 50).map((user, idx) => {
                const profile = allProfiles[user.userId];
                const rawName = profile?.displayName || user.userId.substring(0, 14) + "...";
                const name = rawName.length > 15 ? rawName.substring(0, 15) + "…" : rawName;
                return (
                  <div key={user.userId} className="flex items-center py-1 px-1"
                    style={{ borderBottom: idx < Math.min(analysis.sharedUsers.length, 50) - 1 ? "1px solid rgba(255,255,255,0.04)" : undefined }}>
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
                              style={{ width: 7, height: 7, background: attended ? COLORS[i % COLORS.length] : "#1a1a1e" }} />
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

          {/* Retention widget */}
          <div className="w-px flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ width: 180 }}>
            <div className="text-[9px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
              Retention
            </div>
            <div className="relative" style={{ width: 120, height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={retentionData} cx="50%" cy="50%" innerRadius={36} outerRadius={54}
                    dataKey="value" strokeWidth={0}>
                    {retentionData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>{retentionPct}%</div>
                <div className="text-[8px] font-bold" style={{ color: "var(--text-tertiary)" }}>return</div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 mt-2 text-[9px]">
              <span className="font-bold" style={{ color: "#0095FF" }}>{retentionData[0].value} returning</span>
              <span className="font-bold" style={{ color: "var(--text-tertiary)" }}>{retentionData[1].value} single-event</span>
            </div>
          </div>
        </div>

        {/* Bottom: Overlap matrix */}
        <div className="flex gap-3 flex-shrink-0" style={{ height: 420 }}>
          <div className="skeuo-panel p-3 flex flex-col flex-1 min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
              User Overlap
            </div>
            <div className="flex-1 overflow-auto">
              <table className="text-[8px] w-full">
                <thead>
                  <tr>
                    <th />
                    {analysis.eventMetrics.map((em, i) => (
                      <th key={em.eventId} className="px-1 py-0.5 text-center font-bold" title={em.eventName}
                        style={{ color: COLORS[i % COLORS.length] }}>
                        {em.eventName.length > 6 ? em.eventName.substring(0, 5) + ".." : em.eventName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.eventMetrics.map((row, ri) => (
                    <tr key={row.eventId}>
                      <td className="px-1 py-0.5 font-bold text-right" title={row.eventName}
                        style={{ color: COLORS[ri % COLORS.length] }}>
                        {row.eventName.length > 6 ? row.eventName.substring(0, 5) + ".." : row.eventName}
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
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
