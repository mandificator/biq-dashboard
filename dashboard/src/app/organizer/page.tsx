"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  EventListItem,
  OrganizerInfo,
  EventSummary,
} from "@/types";

export default function OrganizerIndex() {
  const router = useRouter();
  const [orgList, setOrgList] = useState<OrganizerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(false);

  // Check sessionStorage for existing auth
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("biq-org-admin-auth") === "1") {
      setAuthenticated(true);
    }
  }, []);

  const handleLogin = async () => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthenticated(true);
        setAuthError(false);
        sessionStorage.setItem("biq-org-admin-auth", "1");
      } else {
        setAuthError(true);
      }
    } catch {
      setAuthError(true);
    }
  };

  useEffect(() => {
    if (!authenticated) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch("/api/events");
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        const events: EventListItem[] = Array.isArray(data) ? data : data.events || [];

        // Discover unique org IDs
        const orgIdSet = new Set<string>();
        const orgFirstEvent: Record<string, string> = {};
        for (const ev of events) {
          for (const oid of ev.organizerId || []) {
            if (!orgIdSet.has(oid)) {
              orgIdSet.add(oid);
              orgFirstEvent[oid] = ev.id;
            }
          }
        }
        const orgIds = Array.from(orgIdSet);

        // If only one org, redirect immediately
        if (orgIds.length === 1) {
          router.replace(`/organizer/${orgIds[0]}`);
          return;
        }

        if (orgIds.length === 0) {
          setLoading(false);
          return;
        }

        // Fetch org info from analytics
        const infoMap: Record<string, OrganizerInfo> = {};
        const uniqueEventIds = [...new Set(Object.values(orgFirstEvent))];
        await Promise.allSettled(
          uniqueEventIds.map((eventId) =>
            fetch(`/api/summary?eventId=${eventId}`)
              .then((r) => r.ok ? r.json() : null)
              .then((summary: EventSummary | null) => {
                if (summary?.organizers) {
                  for (const [id, info] of Object.entries(summary.organizers)) {
                    if (!infoMap[id]) infoMap[id] = { ...info, id };
                  }
                }
              })
          )
        );

        // Build list with fallbacks
        const list = orgIds.map((oid) => infoMap[oid] || { id: oid, name: oid, logo: "", description: "" });
        setOrgList(list);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, authenticated]);

  if (!authenticated) {
    return (
      <div className="h-screen flex flex-col items-center justify-center" style={{ background: "var(--bg-texture)" }}>
        <div className="skeuo-panel p-6 flex flex-col items-center gap-4" style={{ width: 300 }}>
          <img src="/logo_biq.png" alt="biq" className="w-10 h-10 object-cover rounded"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
          <span className="text-[12px] font-bold" style={{ color: "var(--text-secondary)" }}>Admin Access</span>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setAuthError(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Password"
            className="skeuo-input w-full px-3 py-2 text-[12px] text-center"
            autoFocus
          />
          {authError && (
            <span className="text-[12px]" style={{ color: "var(--red)" }}>Wrong password</span>
          )}
          <button onClick={handleLogin} className="skeuo-btn px-4 py-1.5 text-[12px] font-bold w-full">
            Enter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--bg-texture)" }}>
      <header
        className="flex-shrink-0 flex items-center px-5 h-[52px]"
        style={{
          background: "var(--header-bg)",
          borderBottom: "1px solid var(--header-border)",
          boxShadow: "var(--header-shadow)",
        }}
      >
        <span className="text-[12px] font-bold" style={{ color: "var(--text-secondary)" }}>
          Select Organizer
        </span>
      </header>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      )}

      {error && (
        <div className="skeuo-panel p-3 text-[12px] m-3" style={{ color: "var(--red)" }}>{error}</div>
      )}

      {!loading && !error && orgList.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: "var(--text-tertiary)" }}>
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          <span className="text-[13px]">Loading organizers...</span>
        </div>
      )}

      {!loading && !error && orgList.length > 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", maxWidth: 720, width: "100%" }}>
            {orgList.map((org, i) => (
              <button
                key={org.id}
                onClick={() => router.push(`/organizer/${org.id}`)}
                className="skeuo-panel card-hover p-4 flex items-center gap-3 text-left anim-in"
                style={{ cursor: "pointer", animationDelay: `${i * 60}ms` }}
              >
                {org.logo ? (
                  <img src={org.logo} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.06)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[12px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{org.name}</div>
                  {org.description && (
                    <div className="text-[12px] truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>{org.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
