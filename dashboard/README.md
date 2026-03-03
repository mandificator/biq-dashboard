# biq Analytics Dashboard

Real-time event analytics dashboard for [biq](https://app.biq.me). Built with Next.js 16, React 19, Recharts, and Tailwind CSS 4.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # Production build
```

Requires Node.js (use `nvm` if available).

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── analytics/route.ts     # Proxy → biq.me/api/v0/analytics
│   │   └── events/route.ts        # Proxy → biq.me/api/v0/events
│   ├── event/[eventId]/page.tsx   # Single event analytics
│   ├── organizer/page.tsx         # Multi-event organizer dashboard
│   ├── page.tsx                   # Redirects to /organizer
│   └── layout.tsx                 # Root layout with SideNav
├── components/
│   ├── BeaconHeatmap.tsx          # SVG beacon network visualization
│   ├── BeaconsTab.tsx             # Beacon list & details
│   ├── Charts.tsx                 # Check-in/out area charts, dwell time
│   ├── StatsCards.tsx             # Summary stat cards
│   ├── UsersTab.tsx               # User list, detail panel, journey
│   ├── SideNav.tsx                # Persistent sidebar navigation
│   └── organizer/
│       ├── EventCard.tsx          # Event card for sidebar
│       └── LiveDashboard.tsx      # Cross-event comparison widgets
├── lib/
│   ├── processData.ts             # Raw API → computed analytics
│   └── crossEventAnalysis.ts      # Multi-event overlap & metrics
└── types.ts                       # All TypeScript interfaces
```

## Pages

### `/organizer` (Home)

Multi-event dashboard for organizers. Fetches all events, discovers organizers, and enables cross-event comparison.

- **Left sidebar**: Event list with select all/none, color-coded cards
- **Multi-Metric Profile**: Radar chart comparing events across 5 metrics (attendees, dwell, proofs, beacons, peak concurrent). Sortable legend with breakdown data.
- **Returning Users**: Users who attended 2+ events, with event dot indicators and stats
- **Retention**: Donut chart showing returning vs single-event users
- **User Overlap**: Matrix showing shared user counts between event pairs

State (selected org + events) persists in `sessionStorage` across navigation.

### `/event/[eventId]`

Single event analytics with three tabs:

- **Overview**: Check-in/out timeline charts (10-min buckets) with user tooltips, dwell time list
- **Users**: Arrived/Present/Left columns, user detail panel with beacon journey timeline, beacon heatmap
- **Beacons**: Beacon list with proof counts, filtering, transition analysis

Features:
- Auto-refresh every 30s via incremental `?since=` parameter
- CSV export of user analytics
- Timeline player with speed options (10x-5000x) and two view modes (transition lines vs orbiting PFPs)
- Drag-and-drop beacon positioning on the heatmap

## API Routes

Both routes proxy to `https://app.biq.me/api/v0/` with `Bearer r0b0_analytics` auth.

| Route | Params | Description |
|-------|--------|-------------|
| `GET /api/analytics` | `eventId` (required), `since` (optional) | Event analytics data |
| `GET /api/events` | `organizerId` (optional) | List events |

## Data Processing

**`processAnalytics()`** converts the raw API response into:
- User presence detection (30-min threshold)
- Check-in/out timelines (10-min buckets with user lists)
- Per-user dwell time, beacon journey, proof counts
- Beacon proof counts and user transition tracking

**`analyzeCrossEvents()`** computes:
- Shared users across events (attended 2+)
- Per-event aggregate metrics
- Pairwise overlap matrix

## Tech Stack

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16.1.6 | App Router, API routes, Turbopack |
| React | 19.2.3 | UI framework |
| Recharts | 3.7.0 | Area, Radar, Pie charts |
| Tailwind CSS | 4.x | Utility-first styling |
| Space Mono | -- | Monospace font (Google Fonts) |

## Design System

Dark skeuomorphic theme with CSS variables:

- **Background**: `#1a1a1e` textured
- **Surfaces**: `#242428` to `#2c2c32` gradient panels
- **Accent**: `#0095FF` (logo blue)
- **Palette**: `#0095FF`, `#00D4F5`, `#F7941D`, `#8CC63F`, `#7B5EA7`
- **Text sizes**: 7-11px (labels/body), 22px (large values)
- **Components**: `skeuo-panel`, `skeuo-inset`, `skeuo-btn`, `skeuo-tab-group`

## Scripts

```bash
npm run dev       # Dev server with Turbopack
npm run build     # Production build (type-checks included)
npm run start     # Serve production build
npm run lint      # ESLint
```
