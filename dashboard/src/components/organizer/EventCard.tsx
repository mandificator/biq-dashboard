"use client";

import React, { useState } from "react";
import { EventListItem, ProcessedData } from "@/types";
import Link from "next/link";

interface EventCardProps {
  event: EventListItem;
  selected: boolean;
  onToggle: (eventId: string) => void;
  data: ProcessedData | null;
  loading: boolean;
  color: string;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDur(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export default React.memo(function EventCard({ event, selected, onToggle, data, loading, color }: EventCardProps) {
  const now = Date.now() / 1000;
  const isLive = now >= event.startTime && now < event.endTime;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      className="flex flex-col rounded-lg cursor-pointer transition-all duration-100 overflow-hidden"
      onClick={() => onToggle(event.id)}
      style={{
        background: selected
          ? "linear-gradient(180deg, #363640 0%, #2a2a32 100%)"
          : "transparent",
        borderLeft: `3px solid ${selected ? color : "transparent"}`,
        boxShadow: selected
          ? "1px 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)"
          : "none",
      }}
    >
      {/* Top: image + info */}
      <div className="flex gap-3 p-2.5">
        {/* Square image */}
        <div className="relative w-[72px] h-[72px] flex-shrink-0 rounded-md overflow-hidden" style={{ background: "var(--surface-inset)" }}>
          {event.image && !imgFailed ? (
            <img src={event.image} alt="" className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
              </svg>
            </div>
          )}
          {isLive && (
            <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full skeuo-led" style={{ background: "#00D4F5", color: "#00D4F5" }} />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <div className="text-[12px] font-bold truncate leading-tight" style={{ color: "var(--text-primary)" }}>
              {event.name}
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {formatDate(event.startTime)} — {formatDate(event.endTime)}
            </div>
          </div>
          {loading && (
            <div className="flex items-center gap-1 mt-1">
              <div className="w-2.5 h-2.5 rounded-full animate-spin" style={{ border: "1.5px solid var(--accent)", borderTopColor: "transparent" }} />
              <span className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>Loading...</span>
            </div>
          )}
          {data && !loading && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] font-bold" title="Attendees" style={{ color: "#0095FF" }}>{data.totalAttendees}</span>
              <span style={{ color: "var(--text-tertiary)", opacity: 0.3, fontSize: 9 }}>|</span>
              <span className="text-[9px] font-bold" title="Avg Dwell" style={{ color: "#8CC63F" }}>{formatDur(data.avgDwellMinutes)}</span>
              <span style={{ color: "var(--text-tertiary)", opacity: 0.3, fontSize: 9 }}>|</span>
              <span className="text-[9px] font-bold" title="Proofs" style={{ color: "#F7941D" }}>{data.proofs.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: full-width View button */}
      <Link
        href={`/event/${event.id}`}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-center gap-1.5 py-1.5 text-[9px] font-bold transition-all"
        title="Open in Dashboard"
        style={{
          background: "transparent",
          color: "var(--text-tertiary)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        View Event
      </Link>
    </div>
  );
});
