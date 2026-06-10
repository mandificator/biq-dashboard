"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CrossEventAnalysis } from "@/types";

function formatMinute(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}

interface Props {
  curves: CrossEventAnalysis["presenceCurves"];
  colors: Record<string, string>;
}

/**
 * Overlays each event's concurrent-attendance curve on a shared
 * minutes-from-start axis, so event shapes can be compared directly:
 * how fast people arrive, when the peak hits, how quickly the room drains.
 */
export default function PresenceCompareChart({ curves, colors }: Props) {
  const { data, eventKeys } = useMemo(() => {
    // Merge curves onto a common minute axis (10-min steps)
    const byMinute: Record<number, Record<string, number>> = {};
    for (const curve of curves) {
      for (const pt of curve.points) {
        if (pt.minute < 0) continue; // ignore pre-event proofs
        if (!byMinute[pt.minute]) byMinute[pt.minute] = {};
        byMinute[pt.minute][curve.eventId] = pt.count;
      }
    }
    const minutes = Object.keys(byMinute).map(Number).sort((a, b) => a - b);
    const rows = minutes.map((minute) => ({ minute, ...byMinute[minute] }));
    return {
      data: rows,
      eventKeys: curves.map((c) => ({ id: c.eventId, name: c.eventName })),
    };
  }, [curves]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        No presence data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="minute"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={formatMinute}
          tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          labelFormatter={(min) => `${formatMinute(Number(min))} from start`}
          contentStyle={{
            background: "var(--tooltip-bg)",
            border: "1px solid var(--tooltip-border)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--chart-text)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
          itemStyle={{ padding: 0 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" iconSize={14} />
        {eventKeys.map((ev) => (
          <Line
            key={ev.id}
            type="monotone"
            dataKey={ev.id}
            name={ev.name}
            stroke={colors[ev.id] || "#0095FF"}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive animationDuration={900} animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
