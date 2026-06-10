"use client";

import React from "react";

interface Props {
  totalAttendees: number;
  currentlyPresent: number;
  alreadyLeft: number;
  avgDwellMinutes: number;
  peakConcurrent: number;
}

function formatDur(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const cards = [
  {
    key: "attended",
    label: "Attended",
    color: "var(--accent)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    key: "present",
    label: "Present",
    color: "var(--accent)",
    icon: <div className="w-2.5 h-2.5 rounded-full skeuo-led" style={{ background: "currentColor", color: "currentColor" }} />,
  },
  {
    key: "left",
    label: "Left",
    color: "var(--accent)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    ),
  },
  {
    key: "dwell",
    label: "Avg. Dwell",
    color: "var(--accent)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    key: "peak",
    label: "Peak",
    color: "var(--accent)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
];

export default React.memo(function StatsCards({
  totalAttendees,
  currentlyPresent,
  alreadyLeft,
  avgDwellMinutes,
  peakConcurrent,
}: Props) {
  const values: Record<string, string> = {
    attended: String(totalAttendees),
    present: String(currentlyPresent),
    left: String(alreadyLeft),
    dwell: formatDur(avgDwellMinutes),
    peak: String(peakConcurrent),
  };

  return (
    <div className="flex gap-3">
      {cards.map((c) => (
        <div key={c.key} className="skeuo-panel flex-1 px-4 py-2.5 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
              {c.label}
            </div>
            <div className="text-[26px] font-semibold tracking-tight leading-tight" style={{ color: "var(--text-primary)" }}>
              {values[c.key]}
            </div>
          </div>
          {/* Icon badge — accent tint, consistent across all cards */}
          <div
            className="w-8 h-8 flex items-center justify-center"
            style={{ color: "var(--accent)", background: "var(--accent-dim)", borderRadius: "50%" }}
          >
            {c.icon}
          </div>
        </div>
      ))}
    </div>
  );
});
