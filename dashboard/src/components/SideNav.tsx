"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  match: (path: string) => boolean;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/organizer",
    label: "Organizer",
    match: (p) => p === "/" || p.startsWith("/organizer"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "#",
    label: "Event",
    match: (p) => p.startsWith("/event/"),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
];

export default function SideNav() {
  const pathname = usePathname();
  const onEventPage = pathname.startsWith("/event/");
  // On a dedicated org page (/organizer/someId) — hide nav to prevent accessing other orgs
  const onDedicatedOrgPage = /^\/organizer\/[^/]+/.test(pathname);

  return (
    <nav
      className="flex-shrink-0 flex flex-col items-center py-3 gap-1"
      style={{
        width: 48,
        background: "var(--nav-bg)",
        borderRight: "1px solid rgba(0,0,0,0.5)",
        boxShadow: "1px 0 4px rgba(0,0,0,0.3), inset -1px 0 0 rgba(255,255,255,0.03)",
      }}
    >
      {/* Logo — non-clickable on dedicated org pages */}
      {onDedicatedOrgPage ? (
        <div className="mb-3 flex-shrink-0">
          <img
            src="/logo_biq.png"
            alt="biq"
            className="w-7 h-7 object-cover rounded"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
          />
        </div>
      ) : (
        <Link href="/organizer" className="mb-3 flex-shrink-0">
          <img
            src="/logo_biq.png"
            alt="biq"
            className="w-7 h-7 object-cover rounded"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
          />
        </Link>
      )}

      <div className="w-6 h-px mb-2" style={{ background: "rgba(255,255,255,0.06)" }} />

      {/* Nav items — hide on dedicated org pages, only show Event when on an event page */}
      {!onDedicatedOrgPage && NAV_ITEMS.map((item) => {
        if (item.label === "Event" && !onEventPage) return null;
        const active = item.match(pathname);
        const href = item.label === "Event" ? pathname : item.href;
        return (
          <Link
            key={item.label}
            href={href}
            title={item.label}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-100"
            style={{
              color: active ? "var(--text-primary)" : "var(--text-tertiary)",
              background: active
                ? "var(--selected-bg)"
                : "transparent",
              boxShadow: active
                ? "1px 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)"
                : "none",
            }}
          >
            {item.icon}
          </Link>
        );
      })}
    </nav>
  );
}
