"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

interface TimelinePoint {
  time: number;
  count: number;
}

interface DwellPoint {
  userId: string;
  minutes: number;
}

const tooltipStyle = {
  contentStyle: {
    background: "linear-gradient(180deg, #2a2a30 0%, #222226 100%)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#e8e8ec",
    fontSize: 11,
    fontFamily: "var(--font-space-mono), monospace",
    padding: "8px 12px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.5), 1px 1px 2px rgba(0,0,0,0.3)",
  },
  itemStyle: { color: "#e8e8ec", fontSize: 10 },
  labelStyle: { color: "#9a9aa6", fontSize: 9 },
  cursor: { stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 },
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

export const CheckInChart = React.memo(function CheckInChart({ data }: { data: TimelinePoint[] }) {
  const showDate = needsDate(data);
  const chartData = useMemo(() => data.map((d) => ({
    time: formatLabel(d.time, showDate),
    value: d.count,
  })), [data, showDate]);

  return (
    <div className="skeuo-panel h-full flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          Check-ins
        </span>
      </div>
      <div className="flex-1 min-h-0 mx-3 mb-3 skeuo-inset overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 12, bottom: 4, left: -16 }}>
            <defs>
              <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0095FF" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#0095FF" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fill: "#66666e", fontSize: 9, fontFamily: "var(--font-space-mono)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#66666e", fontSize: 9, fontFamily: "var(--font-space-mono)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Area type="monotone" dataKey="value" name="Check-ins" stroke="#0095FF" fill="url(#ciGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export const CheckOutChart = React.memo(function CheckOutChart({ data }: { data: TimelinePoint[] }) {
  const showDate = needsDate(data);
  const chartData = useMemo(() => data.map((d) => ({
    time: formatLabel(d.time, showDate),
    value: d.count,
  })), [data, showDate]);

  return (
    <div className="skeuo-panel h-full flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          Check-outs
        </span>
      </div>
      <div className="flex-1 min-h-0 mx-3 mb-3 skeuo-inset overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 12, bottom: 4, left: -16 }}>
            <defs>
              <linearGradient id="coGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F7941D" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#F7941D" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fill: "#66666e", fontSize: 9, fontFamily: "var(--font-space-mono)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#66666e", fontSize: 9, fontFamily: "var(--font-space-mono)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Area type="monotone" dataKey="value" name="Check-outs" stroke="#F7941D" fill="url(#coGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export const DwellTimeChart = React.memo(function DwellTimeChart({
  data,
  profiles,
}: {
  data: DwellPoint[];
  profiles: Record<string, { displayName: string }>;
}) {
  const chartData = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.minutes - a.minutes).slice(0, 12);
    return sorted.map((d) => ({
      name: profiles[d.userId]?.displayName || d.userId.substring(0, 6),
      min: d.minutes,
    }));
  }, [data, profiles]);

  return (
    <div className="skeuo-panel h-full flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          Dwell Time
        </span>
      </div>
      <div className="flex-1 min-h-0 mx-3 mb-3 skeuo-inset overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 12, bottom: 4, left: 8 }}>
            <XAxis type="number" tick={{ fill: "#66666e", fontSize: 9, fontFamily: "var(--font-space-mono)" }} axisLine={false} tickLine={false} unit="m" />
            <YAxis type="category" dataKey="name" tick={{ fill: "#9a9aa6", fontSize: 9, fontFamily: "var(--font-space-mono)" }} axisLine={false} tickLine={false} width={72} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="min" name="Minutes" fill="#8CC63F" radius={[0, 4, 4, 0]} opacity={0.85} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
