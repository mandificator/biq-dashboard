"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CrossEventAnalysis } from "@/types";
import { CHART_PRIMARY, CHART_SECONDARY, EVENT_COLORS } from "@/lib/theme";

const LINE_COLOR = EVENT_COLORS[1]; // violet — distinct from the bar blues

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Props {
  growth: CrossEventAnalysis["growth"];
}

/**
 * Audience growth across events, in chronological order: stacked bars of
 * returning vs new attendees per event, with the cumulative unique
 * audience as a line. Duration- and format-agnostic, so any mix of
 * events stays comparable.
 */
export default function AudienceGrowthChart({ growth }: Props) {
  const data = useMemo(() => growth.map((g) => ({
    ...g,
    label: g.eventName.length > 14 ? g.eventName.substring(0, 13) + "…" : g.eventName,
  })), [growth]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
        <YAxis tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "var(--overlay-subtle)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const g = payload[0].payload as typeof data[number];
            const total = g.newUsers + g.returningUsers;
            const retPct = total > 0 ? Math.round((g.returningUsers / total) * 100) : 0;
            return (
              <div style={{
                background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)",
                borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "var(--chart-text)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{g.eventName}</div>
                <div style={{ color: "var(--chart-label)", fontSize: 11, marginBottom: 6 }}>{formatDate(g.startTime)} · {total} attendees</div>
                <div style={{ color: CHART_SECONDARY }}>{g.newUsers} new</div>
                <div style={{ color: CHART_PRIMARY }}>{g.returningUsers} returning ({retPct}%)</div>
                <div style={{ color: LINE_COLOR, marginTop: 4 }}>{g.cumulativeUnique} unique people so far</div>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
        <Bar dataKey="returningUsers" name="Returning" stackId="a" fill={CHART_PRIMARY} radius={[0, 0, 0, 0]} maxBarSize={56}
          isAnimationActive animationDuration={900} animationEasing="ease-out" />
        <Bar dataKey="newUsers" name="New" stackId="a" fill={CHART_SECONDARY} radius={[4, 4, 0, 0]} maxBarSize={56}
          isAnimationActive animationDuration={900} animationEasing="ease-out" />
        <Line dataKey="cumulativeUnique" name="Total audience" stroke={LINE_COLOR} strokeWidth={2}
          dot={{ r: 3, fill: LINE_COLOR, strokeWidth: 0 }}
          isAnimationActive animationDuration={900} animationEasing="ease-out" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
