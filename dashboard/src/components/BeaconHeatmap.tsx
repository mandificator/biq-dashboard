"use client";

import { Beacon, Proof, Profile } from "@/types";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";

interface JourneyStep {
  beaconId: string;
  count: number;
  stepIndex: number;
  time: number;
}

interface JourneyTransition {
  from: string;
  to: string;
  index: number; // chronological order
}

interface JourneyEdge {
  from: string;
  to: string;
  trips: number;
}

interface JourneySummary {
  edges: JourneyEdge[];
  beaconIds: Set<string>;
  startBeaconId: string;
  endBeaconId: string;
}

interface FsSettings {
  bgColor: string;
  showTitle: boolean;
  orgLogo: string | null;
  orgSize: number;
  orgOpacity: number;
  sponsorLogo: string | null;
  sponsorSize: number;
  sponsorOpacity: number;
  orbitCenter: boolean;
  beaconRadius: number;
  pfpRadius: number;
  showSponsor: boolean;
  titleSize: number;
  titleTop: number;
  textColor: string;
  onlyActive1h: boolean;
  qrSize: number;
  qrX: number;
  qrY: number;
}

const FS_STORAGE_KEY = "biq-fs-settings";
const FS_DEFAULTS: FsSettings = {
  bgColor: "#111114", showTitle: false,
  orgLogo: null, orgSize: 120, orgOpacity: 80,
  sponsorLogo: null, sponsorSize: 100, sponsorOpacity: 80,
  orbitCenter: false,
  beaconRadius: 25,
  pfpRadius: 10,
  showSponsor: true,
  titleSize: 56,
  titleTop: 60,
  textColor: "#ffffff",
  onlyActive1h: true,
  qrSize: 50,
  qrX: 370,
  qrY: 370,
};

type S2DragTarget = "pfp" | "text1" | "text2" | "header" | "org" | "sponsor" | "card";
type S2Align = "left" | "center" | "right";

interface S2Settings {
  bgColor: string;
  pfpSize: number;
  // Text 1 — name greeting (supports {name})
  text1Content: string;
  text1Color: string;
  text1Size: number;
  // Text 2 — random from 5 messages
  text2Color: string;
  text2Size: number;
  messages: [string, string, string, string, string];
  // Header text (above card)
  headerText: string;
  headerColor: string;
  headerSize: number;
  headerX: number;
  headerY: number;
  // Card border
  borderColor: string;
  borderWidth: number;
  // Card position
  cardX: number;
  cardY: number;
  // Logos
  orgLogo: string | null;
  orgSize: number;
  orgOpacity: number;
  orgX: number;
  orgY: number;
  sponsorLogo: string | null;
  sponsorSize: number;
  sponsorOpacity: number;
  sponsorX: number;
  sponsorY: number;
}

const S2_STORAGE_KEY = "biq-s2-settings";
const S2_DEFAULTS: S2Settings = {
  bgColor: "#7B5EA7",
  pfpSize: 340,
  // Text 1 — name greeting
  text1Content: "{name}<br>is in the house",
  text1Color: "#ffffff",
  text1Size: 52,
  // Text 2 — random
  text2Color: "#2d1f4e",
  text2Size: 48,
  messages: [
    "I'm a bodybuilder<br>building SolanaID",
    "Just vibing and<br>building on Solana",
    "Here to connect<br>and collaborate",
    "Making waves in<br>the ecosystem",
    "Building the future<br>one block at a time",
  ],
  // Header
  headerText: "proud members of",
  headerColor: "rgba(255,255,255,0.6)",
  headerSize: 28,
  headerX: 50,
  headerY: 10,
  // Card border
  borderColor: "#5A3F80",
  borderWidth: 5,
  // Card position
  cardX: 50,
  cardY: 55,
  // Logos
  orgLogo: null,
  orgSize: 120,
  orgOpacity: 80,
  orgX: 70,
  orgY: 10,
  sponsorLogo: null,
  sponsorSize: 100,
  sponsorOpacity: 80,
  sponsorX: 85,
  sponsorY: 85,
};

function loadS2Settings(): S2Settings {
  if (typeof window === "undefined") return S2_DEFAULTS;
  try {
    const raw = localStorage.getItem(S2_STORAGE_KEY);
    if (!raw) return S2_DEFAULTS;
    const parsed = JSON.parse(raw);
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== undefined) clean[k] = v;
    }
    return { ...S2_DEFAULTS, ...clean } as S2Settings;
  } catch { return S2_DEFAULTS; }
}

function loadFsSettings(): FsSettings {
  if (typeof window === "undefined") return FS_DEFAULTS;
  try {
    const raw = localStorage.getItem(FS_STORAGE_KEY);
    if (!raw) return FS_DEFAULTS;
    const parsed = JSON.parse(raw);
    // Filter out undefined/null-ish values so defaults always apply for new keys
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== undefined) clean[k] = v;
    }
    return { ...FS_DEFAULTS, ...clean } as FsSettings;
  } catch { return FS_DEFAULTS; }
}

interface Props {
  beacons: Record<string, Beacon>;
  beaconProofCounts: Record<string, number>;
  transitions: { from: string; to: string; count: number }[];
  positions: Record<string, { x: number; y: number }>;
  onPositionChange: (beaconId: string, pos: { x: number; y: number }) => void;
  names: Record<string, string>;
  onNameChange: (beaconId: string, name: string) => void;
  selectedUserJourney?: { beaconId: string; time: number }[];
  selectedUserId?: string | null;
  proofs?: Proof[];
  selectedBeaconId?: string | null;
  onSelectBeacon?: (id: string | null) => void;
  filteredBeaconIds?: string[] | null;
  profiles?: Record<string, Profile>;
  eventName?: string;
  eventStartTime?: number;
  eventEndTime?: number;
  onPlaybackTime?: (time: number | null) => void;
  playbackTime?: number | null;
}

export default function BeaconHeatmap({
  beacons,
  beaconProofCounts,
  transitions,
  positions,
  onPositionChange,
  names,
  onNameChange,
  selectedUserJourney,
  selectedUserId,
  proofs,
  selectedBeaconId,
  onSelectBeacon,
  filteredBeaconIds,
  profiles,
  eventName,
  eventStartTime,
  eventEndTime,
  onPlaybackTime,
  playbackTime,
}: Props) {
  const beaconList = useMemo(() => Object.values(beacons), [beacons]);
  const maxCount = useMemo(
    () => Math.max(1, ...Object.values(beaconProofCounts)),
    [beaconProofCounts]
  );
  const maxTransition = useMemo(
    () => Math.max(1, ...transitions.map((t) => t.count)),
    [transitions]
  );

  const [proofRange, setProofRange] = useState<string | null>(null);
  const proofRanges = [
    { id: "1-10", label: "1–10", min: 1, max: 10 },
    { id: "10-50", label: "10–50", min: 10, max: 50 },
    { id: "50-100", label: "50–100", min: 50, max: 100 },
    { id: "100+", label: "100+", min: 100, max: Infinity },
  ];

  const visibleBeaconIds = useMemo(() => {
    if (!proofRange) return null;
    if (proofRange === "last1h") {
      if (!proofs) return null;
      const cutoff = Math.floor(Date.now() / 1000) - 3600;
      const ids = new Set<string>();
      for (const p of proofs) {
        if (p.time >= cutoff) ids.add(p.beaconId);
      }
      return ids;
    }
    const range = proofRanges.find((r) => r.id === proofRange);
    if (!range) return null;
    const ids = new Set<string>();
    for (const b of Object.values(beacons)) {
      const count = beaconProofCounts[b.id] || 0;
      if (count >= range.min && count <= range.max) ids.add(b.id);
    }
    return ids;
  }, [proofRange, beacons, beaconProofCounts, proofs]);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 400, h: 400 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const didDragRef = useRef(false);
  const [localDragPos, setLocalDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editingBeacon, setEditingBeacon] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editPos, setEditPos] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Separate positions for fullscreen — independent of widget positions
  const [fsPositions, setFsPositions] = useState<Record<string, { x: number; y: number }>>({});

  // ── Timeline player state ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [localPlaybackTime, setLocalPlaybackTime] = useState(eventStartTime || 0);
  const [playSpeed, setPlaySpeed] = useState(100);
  const [viewMode, setViewMode] = useState<"lines" | "pfps">("lines");
  const playRafRef = useRef<number>(0);
  const playLastFrameRef = useRef<number>(0);
  const hasTimeline = eventStartTime != null && eventEndTime != null && onPlaybackTime && eventEndTime > eventStartTime;
  const isPlaybackActive = playbackTime != null;

  // Sync local time from parent when scrubbing (not during playback)
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  useEffect(() => {
    if (playbackTime != null && !isPlayingRef.current) setLocalPlaybackTime(playbackTime);
  }, [playbackTime]);

  // Reset local time when event times change
  useEffect(() => {
    if (eventStartTime != null) setLocalPlaybackTime(eventStartTime);
  }, [eventStartTime]);

  // Ref to call parent without re-triggering effects
  const onPlaybackTimeRef = useRef(onPlaybackTime);
  onPlaybackTimeRef.current = onPlaybackTime;

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !hasTimeline) return;
    playLastFrameRef.current = performance.now();

    const tick = (now: number) => {
      const delta = (now - playLastFrameRef.current) / 1000;
      playLastFrameRef.current = now;
      setLocalPlaybackTime((prev) => {
        const next = prev + delta * playSpeed;
        if (next >= eventEndTime!) {
          setIsPlaying(false);
          queueMicrotask(() => onPlaybackTimeRef.current?.(eventEndTime!));
          return eventEndTime!;
        }
        queueMicrotask(() => onPlaybackTimeRef.current?.(next));
        return next;
      });
      playRafRef.current = requestAnimationFrame(tick);
    };

    playRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playRafRef.current);
  }, [isPlaying, playSpeed, eventEndTime, onPlaybackTime, hasTimeline]);

  const handlePlay = useCallback(() => {
    if (!hasTimeline) return;
    if (localPlaybackTime >= eventEndTime!) {
      setLocalPlaybackTime(eventStartTime!);
      onPlaybackTime!(eventStartTime!);
    }
    setIsPlaying(true);
    onPlaybackTime!(localPlaybackTime);
  }, [hasTimeline, localPlaybackTime, eventEndTime, eventStartTime, onPlaybackTime]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setLocalPlaybackTime(eventStartTime || 0);
    onPlaybackTime?.(null);
  }, [eventStartTime, onPlaybackTime]);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    setLocalPlaybackTime(t);
    onPlaybackTime?.(t);
    if (isPlaying) setIsPlaying(false);
  }, [isPlaying, onPlaybackTime]);

  // ── Moving PFPs during playback ──
  const movingPfps = useMemo(() => {
    if (!isPlaybackActive || viewMode !== "pfps" || !proofs || !profiles || !playbackTime) return null;

    // Build per-user timeline of beacon visits up to playbackTime
    const userTimelines: Record<string, { beaconId: string; time: number }[]> = {};
    for (const p of proofs) {
      if (p.time <= playbackTime) {
        if (!userTimelines[p.userId]) userTimelines[p.userId] = [];
        userTimelines[p.userId].push({ beaconId: p.beaconId, time: p.time });
      }
    }

    const activePositionsMap = isFullscreen ? fsPositions : positions;
    const maxC = Math.max(1, ...Object.values(beaconProofCounts));

    // First pass: figure out who is at each beacon (not moving)
    const beaconOccupants: Record<string, string[]> = {};
    const pfpRaw: { userId: string; beaconId: string; pic: string; name: string; moving: boolean; x: number; y: number }[] = [];

    for (const [uid, timeline] of Object.entries(userTimelines)) {
      if (timeline.length === 0) continue;
      timeline.sort((a, b) => a.time - b.time);
      const profile = profiles[uid];
      if (!profile) continue;

      const last = timeline[timeline.length - 1];
      const lastPos = activePositionsMap[last.beaconId];
      if (!lastPos) continue;

      // Check if user is "in transit" — interpolate between last two different beacons
      let moving = false;
      let x = lastPos.x;
      let y = lastPos.y;

      if (timeline.length >= 2) {
        const prev = timeline[timeline.length - 2];
        if (prev.beaconId !== last.beaconId) {
          const prevPos = activePositionsMap[prev.beaconId];
          if (prevPos) {
            const transitionDuration = Math.min(last.time - prev.time, 120);
            const elapsed = playbackTime - prev.time;
            const t = Math.min(1, elapsed / transitionDuration);
            if (t < 1) {
              // Smooth easing
              const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
              x = prevPos.x + (lastPos.x - prevPos.x) * ease;
              y = prevPos.y + (lastPos.y - prevPos.y) * ease;
              moving = true;
            }
          }
        }
      }

      if (!moving) {
        // Track beacon occupants for ring layout
        if (!beaconOccupants[last.beaconId]) beaconOccupants[last.beaconId] = [];
        beaconOccupants[last.beaconId].push(uid);
      }

      pfpRaw.push({ userId: uid, beaconId: last.beaconId, pic: profile.profilePicture || "", name: profile.displayName || uid, moving, x, y });
    }

    // Second pass: position occupants in rings around their beacon
    const PR = 7; // pfp radius in SVG coords
    for (const item of pfpRaw) {
      if (item.moving) continue;
      const beaconPos = activePositionsMap[item.beaconId];
      if (!beaconPos) continue;

      const occupants = beaconOccupants[item.beaconId] || [];
      const idx = occupants.indexOf(item.userId);
      const total = occupants.length;
      const count = beaconProofCounts[item.beaconId] || 0;
      const nodeRadius = 18 + (count / maxC) * 22;

      if (total === 1) {
        // Single occupant: place just outside the beacon circle (top)
        item.x = beaconPos.x;
        item.y = beaconPos.y - nodeRadius - PR - 2;
      } else {
        // Multiple: spread in concentric rings around the beacon
        const perRing = Math.max(6, Math.floor((2 * Math.PI * (nodeRadius + PR + 4)) / (PR * 2.4)));
        const ringIdx = Math.floor(idx / perRing);
        const posInRing = idx % perRing;
        const ringTotal = Math.min(perRing, total - ringIdx * perRing);
        const ringRadius = nodeRadius + PR + 4 + ringIdx * (PR * 2.4);
        const angle = (2 * Math.PI * posInRing) / ringTotal - Math.PI / 2;
        item.x = beaconPos.x + Math.cos(angle) * ringRadius;
        item.y = beaconPos.y + Math.sin(angle) * ringRadius;
      }
    }

    // If a user is selected, show only their PFP
    if (selectedUserId) {
      return pfpRaw.filter(p => p.userId === selectedUserId);
    }
    return pfpRaw;
  }, [isPlaybackActive, viewMode, proofs, profiles, playbackTime, positions, fsPositions, isFullscreen, beaconProofCounts, selectedUserId]);

  // Fullscreen display settings — persisted to localStorage
  const [fsSettings, setFsSettings] = useState<FsSettings>(FS_DEFAULTS);

  useEffect(() => {
    const loaded = loadFsSettings();
    setFsSettings(loaded);
    // Re-save to persist any new default keys
    try { localStorage.setItem(FS_STORAGE_KEY, JSON.stringify(loaded)); } catch {}
  }, []);

  const updateFs = useCallback(<K extends keyof FsSettings>(key: K, value: FsSettings[K]) => {
    setFsSettings((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(FS_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // QR code data URL for Screen 1
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL("https://www.biq.me/download", { margin: 1, width: 256, color: { dark: "#000000", light: "#ffffff" } })
      .then((url: string) => setQrDataUrl(url))
      .catch(() => {});
  }, []);

  // QR dragging state (in SVG coords)
  const [draggingQr, setDraggingQr] = useState(false);
  const qrDragOffset = useRef({ x: 0, y: 0 });

  // Screen 2 settings — persisted separately
  const [s2Settings, setS2Settings] = useState<S2Settings>(S2_DEFAULTS);
  const [showSettings2, setShowSettings2] = useState(false);

  // Screen 2 — new window with featured latest proof
  const popup2Ref = useRef<Window | null>(null);
  const [popup2Container, setPopup2Container] = useState<HTMLDivElement | null>(null);
  const [isScreen2, setIsScreen2] = useState(false);
  const [s2MsgIndex, setS2MsgIndex] = useState(0);
  const prevNewestIdRef = useRef<string | null>(null);
  const [s2Scale, setS2Scale] = useState(1);
  const S2_DESIGN_W = 1920;
  const S2_DESIGN_H = 1080;

  // Keep scale in sync with popup window size
  useEffect(() => {
    if (!isScreen2) return;
    const win = popup2Ref.current;
    if (!win || win.closed) return;
    const update = () => {
      const sw = win.innerWidth / S2_DESIGN_W;
      const sh = win.innerHeight / S2_DESIGN_H;
      setS2Scale(Math.min(sw, sh));
    };
    update();
    win.addEventListener("resize", update);
    return () => { try { win.removeEventListener("resize", update); } catch {} };
  }, [isScreen2, popup2Container]);

  // Newest proof for Screen 2
  const newestProof = useMemo(() => {
    if (!proofs || proofs.length === 0) return null;
    let latest = proofs[0];
    for (const p of proofs) {
      if (p.time > latest.time) latest = p;
    }
    return latest;
  }, [proofs]);

  useEffect(() => {
    const loaded = loadS2Settings();
    setS2Settings(loaded);
    try { localStorage.setItem(S2_STORAGE_KEY, JSON.stringify(loaded)); } catch {}
  }, []);

  const updateS2 = useCallback(<K extends keyof S2Settings>(key: K, value: S2Settings[K]) => {
    setS2Settings((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(S2_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Pick a random message index when newest proof changes
  useEffect(() => {
    if (newestProof && newestProof.id !== prevNewestIdRef.current) {
      prevNewestIdRef.current = newestProof.id;
      setS2MsgIndex(Math.floor(Math.random() * 5));
    }
  }, [newestProof]);

  // Dragging for all Screen 2 elements — imperative approach
  const s2SettingsRef = useRef(s2Settings);
  s2SettingsRef.current = s2Settings;
  const updateS2Ref = useRef(updateS2);
  updateS2Ref.current = updateS2;

  const handleS2DragStart = useCallback((target: S2DragTarget, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const keys = { pfp: ["cardX", "cardY"], text1: ["cardX", "cardY"], text2: ["cardX", "cardY"], card: ["cardX", "cardY"], header: ["headerX", "headerY"], org: ["orgX", "orgY"], sponsor: ["sponsorX", "sponsorY"] } as const;
    const [kx, ky] = keys[target];
    const cur = s2SettingsRef.current;
    const origX = (cur[kx] as number) || 50;
    const origY = (cur[ky] as number) || 50;
    const startX = e.clientX;
    const startY = e.clientY;

    // Find the popup window for this portal
    const win = popup2Ref.current && !popup2Ref.current.closed ? popup2Ref.current : window;
    const vp = win.document.querySelector("[data-s2-viewport]");
    if (!vp) return;
    const vpRect = vp.getBoundingClientRect();
    // Use actual rendered size to convert px deltas → design % (accounts for scale)
    const renderedW = vpRect.width;
    const renderedH = vpRect.height;

    const onMove = (ev: MouseEvent) => {
      const dx = ((ev.clientX - startX) / renderedW) * 100;
      const dy = ((ev.clientY - startY) / renderedH) * 100;
      const nx = Math.max(0, Math.min(100, origX + dx));
      const ny = Math.max(0, Math.min(100, origY + dy));
      updateS2Ref.current(kx as keyof S2Settings, nx as never);
      updateS2Ref.current(ky as keyof S2Settings, ny as never);
    };
    const onUp = () => {
      win.removeEventListener("mousemove", onMove);
      win.removeEventListener("mouseup", onUp);
    };
    win.addEventListener("mousemove", onMove);
    win.addEventListener("mouseup", onUp);
  }, []);

  const handleS2LogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>, key: "orgLogo" | "sponsorLogo") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateS2(key, reader.result as string);
    reader.readAsDataURL(file);
  }, [updateS2]);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>, key: "orgLogo" | "sponsorLogo") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateFs(key, reader.result as string);
    reader.readAsDataURL(file);
  }, [updateFs]);

  // Fullscreen in new window (Screen 1)
  const popupRef = useRef<Window | null>(null);
  const [popupContainer, setPopupContainer] = useState<HTMLDivElement | null>(null);

  const openPopupWindow = useCallback((name: string, title: string): { popup: Window; container: HTMLDivElement } | null => {
    const popup = window.open("", name, "width=1200,height=800,menubar=no,toolbar=no,location=no,status=no");
    if (!popup) return null;
    popup.document.title = title;
    popup.document.body.style.cssText = "margin:0;padding:0;overflow:hidden;font-family:monospace;";
    popup.document.body.innerHTML = "";
    const container = popup.document.createElement("div");
    container.id = "biq-fs-root";
    container.style.cssText = "width:100vw;height:100vh;";
    popup.document.body.appendChild(container);
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach((link) => {
      const clone = popup.document.createElement("link");
      clone.rel = "stylesheet";
      clone.href = (link as HTMLLinkElement).href;
      popup.document.head.appendChild(clone);
    });
    return { popup, container };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
      popupRef.current = null;
      setPopupContainer(null);
      setIsFullscreen(false);
      return;
    }
    const result = openPopupWindow("biq-fullscreen", eventName || "biq Fullscreen");
    if (!result) return;
    popupRef.current = result.popup;
    setPopupContainer(result.container);
    setFsPositions({ ...positions }); // snapshot widget positions as initial fullscreen positions
    setIsFullscreen(true);
    result.popup.addEventListener("beforeunload", () => {
      popupRef.current = null;
      setPopupContainer(null);
      setIsFullscreen(false);
    });
  }, [eventName, openPopupWindow]);

  const toggleScreen2 = useCallback(() => {
    if (popup2Ref.current && !popup2Ref.current.closed) {
      popup2Ref.current.close();
      popup2Ref.current = null;
      setPopup2Container(null);
      setIsScreen2(false);
      return;
    }
    const result = openPopupWindow("biq-screen2", eventName || "biq Screen 2");
    if (!result) return;
    popup2Ref.current = result.popup;
    setPopup2Container(result.container);
    setIsScreen2(true);
    result.popup.addEventListener("beforeunload", () => {
      popup2Ref.current = null;
      setPopup2Container(null);
      setIsScreen2(false);
    });
  }, [eventName, openPopupWindow]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      if (popup2Ref.current && !popup2Ref.current.closed) popup2Ref.current.close();
    };
  }, []);

  // Track SVG container size for dynamic viewBox (debounced)
  useEffect(() => {
    const el = svgWrapRef.current;
    if (!el) return;
    let rafId: number | null = null;
    const ro = new ResizeObserver((entries) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) setSvgSize({ w: width, h: height });
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (rafId) cancelAnimationFrame(rafId); };
  }, [isFullscreen, popupContainer]);

  // Dynamic viewBox: height always 400, width scales to match aspect ratio
  const vbH = 400;
  const vbW = svgSize.h > 0 ? Math.round((svgSize.w / svgSize.h) * vbH) : 400;
  const vbX = -(vbW - 400) / 2; // center so 200,200 stays in the middle
  const viewBox = `${vbX} 0 ${vbW} ${vbH}`;

  // Beacons active in the last hour (for fullscreen filtering)
  const fsActiveBeaconIds = useMemo(() => {
    if (!isFullscreen || !fsSettings.onlyActive1h || !proofs) return null;
    const cutoff = Math.floor(Date.now() / 1000) - 3600;
    const ids = new Set<string>();
    for (const p of proofs) {
      if (p.time >= cutoff) ids.add(p.beaconId);
    }
    return ids;
  }, [isFullscreen, fsSettings.onlyActive1h, proofs]);

  // Compute orbiting PFPs per beacon (only in fullscreen)
  const orbitingPfps = useMemo(() => {
    if (!isFullscreen || !proofs || !profiles) return {};
    const cutoff = Math.floor(Date.now() / 1000) - 1800;
    const result: Record<string, { userId: string; freshness: number; profilePicture: string; orbitSpeed: number; startAngle: number }[]> = {};

    // First pass: find each user's globally latest proof → assign them to that beacon only
    const userLatestBeacon: Record<string, { beaconId: string; time: number }> = {};
    for (const p of proofs) {
      if (p.time < cutoff) continue;
      const prev = userLatestBeacon[p.userId];
      if (!prev || p.time > prev.time) {
        userLatestBeacon[p.userId] = { beaconId: p.beaconId, time: p.time };
      }
    }
    // Second pass: group users by their latest beacon
    const beaconUserLatest: Record<string, Record<string, number>> = {};
    for (const [userId, { beaconId, time }] of Object.entries(userLatestBeacon)) {
      if (!beaconUserLatest[beaconId]) beaconUserLatest[beaconId] = {};
      beaconUserLatest[beaconId][userId] = time;
    }

    // Compute active beacon IDs (1h) inline for filtering
    const active1hIds = fsSettings.onlyActive1h ? (() => {
      const c = Math.floor(Date.now() / 1000) - 3600;
      const s = new Set<string>();
      for (const p of proofs) { if (p.time >= c) s.add(p.beaconId); }
      return s;
    })() : null;

    for (const [beaconId, users] of Object.entries(beaconUserLatest)) {
      if (active1hIds && !active1hIds.has(beaconId)) continue;
      const entries: typeof result[string] = [];
      let idx = 0;
      for (const [userId, time] of Object.entries(users)) {
        const profile = profiles[userId];
        if (!profile?.profilePicture) continue;
        const freshness = (time - cutoff) / 1800;
        entries.push({
          userId,
          freshness: Math.max(0, Math.min(1, freshness)),
          profilePicture: profile.profilePicture,
          orbitSpeed: (2 * Math.PI) / (18 + (idx % 5)),
          startAngle: (idx / Math.max(Object.keys(users).length, 1)) * 2 * Math.PI,
        });
        idx++;
      }
      if (entries.length > 0) result[beaconId] = entries;
    }

    return result;
  }, [isFullscreen, proofs, profiles, beacons, fsSettings.onlyActive1h]);

  // Pre-compute orbit layout data (ring assignments) — pure CSS animation, zero JS per frame
  const orbitLayout = useMemo(() => {
    if (!isFullscreen || Object.keys(orbitingPfps).length === 0) return null;
    const pr = fsSettings.pfpRadius;
    const RING_COUNT = 4;

    type OrbitItem = {
      userId: string; profilePicture: string;
      centerX: number; centerY: number;
      orbitRadius: number; period: number; delayS: number;
    };

    function assignRings(
      centerX: number, centerY: number, innerR: number, ringGap: number,
      users: { userId: string; freshness: number; profilePicture: string; orbitSpeed: number; startAngle: number }[],
      keyPrefix: string,
    ) {
      const pfpDiam = pr * 2 + 4;
      const ringRadii = [innerR, innerR + ringGap, innerR + 2 * ringGap, innerR + 3 * ringGap];

      // Distribute users evenly across all 4 rings (round-robin)
      const buckets: typeof users[] = [[], [], [], []];
      for (let i = 0; i < users.length; i++) {
        buckets[i % RING_COUNT].push(users[i]);
      }

      // Capacity check: if a ring is over capacity, push overflow outward
      for (let ri = 0; ri < RING_COUNT; ri++) {
        const cap = Math.max(1, Math.floor((2 * Math.PI * ringRadii[ri]) / pfpDiam));
        if (buckets[ri].length > cap) {
          const overflow = buckets[ri].splice(cap);
          if (ri + 1 < RING_COUNT) {
            buckets[ri + 1].unshift(...overflow);
          }
        }
      }

      const items: OrbitItem[] = [];
      for (let ri = 0; ri < RING_COUNT; ri++) {
        const r = ringRadii[ri];
        const bucket = buckets[ri];
        // Same period for all PFPs on same ring so they never overlap
        const ringPeriod = 18 + ri * 4;
        for (let i = 0; i < bucket.length; i++) {
          const u = bucket[i];
          const baseAngle = (i / Math.max(bucket.length, 1)) * Math.PI * 2;
          const delayS = -(baseAngle / (2 * Math.PI)) * ringPeriod;
          items.push({
            userId: u.userId, profilePicture: u.profilePicture,
            centerX, centerY, orbitRadius: r, period: ringPeriod, delayS,
          });
        }
      }
      return { ringRadii, items, centerX, centerY, keyPrefix };
    }

    const groups: ReturnType<typeof assignRings>[] = [];
    if (fsSettings.orbitCenter) {
      const allUsers: typeof orbitingPfps[string] = [];
      const seen = new Set<string>();
      for (const [bid, users] of Object.entries(orbitingPfps)) {
        if (visibleBeaconIds && !visibleBeaconIds.has(bid)) continue;
        if (fsActiveBeaconIds && !fsActiveBeaconIds.has(bid)) continue;
        for (const u of users) { if (!seen.has(u.userId)) { seen.add(u.userId); allUsers.push(u); } }
      }
      groups.push(assignRings(200, 200, (fsSettings.orgSize / 2) + 15, pr * 2 + 8, allUsers, "center"));
    } else {
      for (const [bid, users] of Object.entries(orbitingPfps)) {
        const bPos = (isFullscreen ? fsPositions : positions)[bid];
        if (!bPos) continue;
        if (visibleBeaconIds && !visibleBeaconIds.has(bid)) continue;
        if (fsActiveBeaconIds && !fsActiveBeaconIds.has(bid)) continue;
        groups.push(assignRings(bPos.x, bPos.y, fsSettings.beaconRadius + 10, pr * 2 + 6, users, bid));
      }
    }
    return groups;
  }, [isFullscreen, orbitingPfps, fsSettings.pfpRadius, fsSettings.orbitCenter, fsSettings.orgSize, fsSettings.beaconRadius, visibleBeaconIds, fsActiveBeaconIds, positions, fsPositions]);

  // Build journey steps — filtered by playbackTime when playing
  const journeySteps = useMemo<JourneyStep[]>(() => {
    if (!selectedUserJourney || selectedUserJourney.length === 0) return [];
    const steps: JourneyStep[] = [];
    let stepIdx = 0;
    for (const entry of selectedUserJourney) {
      if (playbackTime != null && entry.time > playbackTime) break;
      const last = steps[steps.length - 1];
      if (last && last.beaconId === entry.beaconId) {
        last.count++;
      } else {
        steps.push({ beaconId: entry.beaconId, count: 1, stepIndex: stepIdx++, time: entry.time });
      }
    }
    return steps;
  }, [selectedUserJourney, playbackTime]);

  // Individual transitions for progressive drawing with fade
  const journeyTransitions = useMemo<JourneyTransition[]>(() => {
    if (journeySteps.length < 2) return [];
    const transitions: JourneyTransition[] = [];
    for (let i = 1; i < journeySteps.length; i++) {
      const a = journeySteps[i - 1].beaconId;
      const b = journeySteps[i].beaconId;
      if (a === b) continue;
      transitions.push({ from: a, to: b, index: transitions.length });
    }
    return transitions;
  }, [journeySteps]);

  // Directional journey: separate A→B and B→A edges with trip counts
  const journeySummary = useMemo<JourneySummary | null>(() => {
    if (journeySteps.length < 2) return null;
    const edgeMap: Record<string, number> = {};
    const beaconIds = new Set<string>();
    for (const s of journeySteps) beaconIds.add(s.beaconId);
    for (let i = 1; i < journeySteps.length; i++) {
      const a = journeySteps[i - 1].beaconId;
      const b = journeySteps[i].beaconId;
      if (a === b) continue;
      const key = `${a}||${b}`;
      edgeMap[key] = (edgeMap[key] || 0) + 1;
    }
    const edges: JourneyEdge[] = Object.entries(edgeMap).map(([key, trips]) => {
      const [from, to] = key.split("||");
      return { from, to, trips };
    });
    return {
      edges,
      beaconIds,
      startBeaconId: journeySteps[0].beaconId,
      endBeaconId: journeySteps[journeySteps.length - 1].beaconId,
    };
  }, [journeySteps]);

  function getHeatColor(count: number): string {
    if (isFullscreen) {
      return darkenHex(fsSettings.bgColor, 0.15);
    }
    const ratio = count / maxCount;
    if (ratio < 0.33) return "#0095FF";
    if (ratio < 0.66) return "#00D4F5";
    return "#F7941D";
  }

  function darkenHex(hex: string, amount: number): string {
    const c = hex.replace("#", "");
    const r = Math.max(0, Math.round(parseInt(c.substring(0, 2), 16) * (1 - amount)));
    const g = Math.max(0, Math.round(parseInt(c.substring(2, 4), 16) * (1 - amount)));
    const b = Math.max(0, Math.round(parseInt(c.substring(4, 6), 16) * (1 - amount)));
    return `rgb(${r},${g},${b})`;
  }

  function getBeaconName(b: Beacon): string {
    const custom = names[b.id];
    if (custom) return custom;
    return b.name || b.id.substring(0, 8);
  }

  function truncName(name: string, max: number = 16): string {
    return name.length > max ? name.substring(0, max - 2) + ".." : name;
  }

  const toSvgCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const handleMouseDown = useCallback((beaconId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const svgPt = toSvgCoords(e);
    const curPositions = isFullscreen ? fsPositions : positions;
    const pos = curPositions[beaconId];
    if (!pos) return;
    setDragging(beaconId);
    didDragRef.current = false;
    setDragOffset({ x: svgPt.x - pos.x, y: svgPt.y - pos.y });
  }, [toSvgCoords, positions, isFullscreen, fsPositions]);

  const dragRafRef = useRef(0);
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return;
    didDragRef.current = true;
    cancelAnimationFrame(dragRafRef.current);
    dragRafRef.current = requestAnimationFrame(() => {
      const svgPt = toSvgCoords(e);
      const minX = vbX + 20;
      const maxX = vbX + vbW - 20;
      const newX = Math.max(minX, Math.min(maxX, svgPt.x - dragOffset.x));
      const newY = Math.max(20, Math.min(380, svgPt.y - dragOffset.y));
      setLocalDragPos({ id: dragging, x: newX, y: newY });
    });
  }, [dragging, dragOffset, toSvgCoords, vbX, vbW]);

  const handleMouseUp = useCallback(() => {
    if (dragging && !didDragRef.current && onSelectBeacon && !isFullscreen) {
      onSelectBeacon(selectedBeaconId === dragging ? null : dragging);
    }
    if (dragging && localDragPos && didDragRef.current) {
      if (isFullscreen) {
        // Save to fullscreen-local positions (doesn't affect widget)
        setFsPositions((prev) => ({ ...prev, [localDragPos.id]: { x: localDragPos.x, y: localDragPos.y } }));
      } else {
        onPositionChange(localDragPos.id, { x: localDragPos.x, y: localDragPos.y });
      }
    }
    setLocalDragPos(null);
    setDragging(null);
  }, [dragging, onSelectBeacon, selectedBeaconId, localDragPos, onPositionChange, isFullscreen]);

  useEffect(() => {
    if (dragging) {
      // In fullscreen, events come from the popup window, not the main window
      const targetWindow = (isFullscreen && popupRef.current && !popupRef.current.closed) ? popupRef.current : window;
      targetWindow.addEventListener("mousemove", handleMouseMove);
      targetWindow.addEventListener("mouseup", handleMouseUp);
      return () => {
        targetWindow.removeEventListener("mousemove", handleMouseMove);
        targetWindow.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp, isFullscreen]);

  // QR drag handlers
  const handleQrMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const svgPt = toSvgCoords(e);
    qrDragOffset.current = { x: svgPt.x - fsSettings.qrX, y: svgPt.y - fsSettings.qrY };
    setDraggingQr(true);
  }, [toSvgCoords, fsSettings.qrX, fsSettings.qrY]);

  const handleQrMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingQr) return;
    const svgPt = toSvgCoords(e);
    const nx = svgPt.x - qrDragOffset.current.x;
    const ny = svgPt.y - qrDragOffset.current.y;
    updateFs("qrX", nx);
    updateFs("qrY", ny);
  }, [draggingQr, toSvgCoords, updateFs]);

  const handleQrMouseUp = useCallback(() => {
    setDraggingQr(false);
  }, []);

  useEffect(() => {
    if (draggingQr) {
      const targetWindow = (isFullscreen && popupRef.current && !popupRef.current.closed) ? popupRef.current : window;
      targetWindow.addEventListener("mousemove", handleQrMouseMove);
      targetWindow.addEventListener("mouseup", handleQrMouseUp);
      return () => {
        targetWindow.removeEventListener("mousemove", handleQrMouseMove);
        targetWindow.removeEventListener("mouseup", handleQrMouseUp);
      };
    }
  }, [draggingQr, handleQrMouseMove, handleQrMouseUp, isFullscreen]);

  const handleDoubleClick = useCallback((beaconId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;
    const beacon = beacons[beaconId];
    if (!beacon) return;
    const containerRect = container.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const pos = (isFullscreen ? fsPositions : positions)[beaconId];
    if (!pos) return;
    const scaleX = svgRect.width / 400;
    const scaleY = svgRect.height / 400;
    const px = svgRect.left - containerRect.left + pos.x * scaleX;
    const py = svgRect.top - containerRect.top + pos.y * scaleY;
    setEditingBeacon(beaconId);
    setEditValue(getBeaconName(beacon));
    setEditPos({ x: px, y: py + 30 });
  }, [beacons, positions, names]);

  const commitRename = useCallback(() => {
    if (editingBeacon && editValue.trim()) {
      onNameChange(editingBeacon, editValue.trim());
    }
    setEditingBeacon(null);
  }, [editingBeacon, editValue, onNameChange]);

  if (beaconList.length === 0) {
    return (
      <div className="skeuo-panel h-full flex items-center justify-center text-[--text-tertiary] text-[11px]">
        No beacon data
      </div>
    );
  }

  // Active positions: fullscreen uses its own set, widget uses props
  const activePositions = isFullscreen ? fsPositions : positions;
  // In fullscreen, ignore parent selection entirely
  const activeSelectedId = isFullscreen ? null : selectedBeaconId;
  const getPos = (id: string) => (localDragPos && localDragPos.id === id) ? localDragPos : activePositions[id];
  const hasJourney = !!journeySummary;

  // ── STATIC SVG content (memoized — does NOT depend on orbitTick) ──
  const staticSvg = useMemo(() => (
    <>
      <defs>
        {beaconList.map((b) => {
          const color = getHeatColor(beaconProofCounts[b.id] || 0);
          return (
            <radialGradient key={`glow-${b.id}`} id={`glow-${b.id}`}>
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
          );
        })}
        <marker id="journey-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
          <polygon points="0 0.8, 6 3, 0 5.2" fill="#00D4F5" opacity="0.8" />
        </marker>
        {/* Stable clipPaths for PFPs — one per user, reused every frame */}
        {Object.values(orbitingPfps).flat().map((u) => (
          <clipPath key={`pfp-clip-${u.userId}`} id={`pfp-clip-${u.userId}`}>
            <circle cx={0} cy={0} r={fsSettings.pfpRadius} />
          </clipPath>
        ))}
      </defs>

      {/* Background logos (fullscreen only) */}
      {isFullscreen && fsSettings.orgLogo && (
        <image href={fsSettings.orgLogo} x={200 - fsSettings.orgSize / 2} y={200 - fsSettings.orgSize / 2}
          width={fsSettings.orgSize} height={fsSettings.orgSize} opacity={fsSettings.orgOpacity / 100}
          preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: "none" }} />
      )}
      {isFullscreen && fsSettings.showSponsor && fsSettings.sponsorLogo && (() => {
        const logoH = fsSettings.sponsorSize * 0.4;
        const textSize = Math.max(5, fsSettings.sponsorSize * 0.08);
        const logoY = 400 - logoH - 4;
        return (
          <>
            <text x={200} y={logoY - 3} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={textSize}
              fontWeight="600" letterSpacing="1.5" style={{ pointerEvents: "none", textTransform: "uppercase" } as React.CSSProperties}>
              sponsored by
            </text>
            <image href={fsSettings.sponsorLogo} x={200 - fsSettings.sponsorSize / 2} y={logoY}
              width={fsSettings.sponsorSize} height={logoH} opacity={fsSettings.sponsorOpacity / 100}
              preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: "none" }} />
          </>
        );
      })()}

    </>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [beaconList, beaconProofCounts, isFullscreen, fsSettings, visibleBeaconIds, fsActiveBeaconIds, orbitingPfps]);

  // ── Interactive SVG layer (transitions, beacons, labels) — NOT memoized to allow smooth drag ──
  const interactiveSvg = (
    <>
      {/* Transition lines */}
      {!hasJourney && !(isFullscreen && fsSettings.orbitCenter) && transitions.map((t, i) => {
        const fromPos = getPos(t.from);
        const toPos = getPos(t.to);
        if (!fromPos || !toPos) return null;
        const involves = activeSelectedId && (t.from === activeSelectedId || t.to === activeSelectedId);
        const filteredOut = filteredBeaconIds && (!filteredBeaconIds.includes(t.from) || !filteredBeaconIds.includes(t.to));
        const rangeHidden = visibleBeaconIds && (!visibleBeaconIds.has(t.from) || !visibleBeaconIds.has(t.to));
        const fsHidden = fsActiveBeaconIds && (!fsActiveBeaconIds.has(t.from) || !fsActiveBeaconIds.has(t.to));
        if ((activeSelectedId && !involves) || filteredOut || rangeHidden || fsHidden) return null;
        const opacity = involves ? 0.5 + 0.5 * (t.count / maxTransition) : 0.2 + 0.5 * (t.count / maxTransition);
        const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return null;
        const fromRadius = isFullscreen ? fsSettings.beaconRadius : 18 + ((beaconProofCounts[t.from] || 0) / maxCount) * 22;
        const toRadius = isFullscreen ? fsSettings.beaconRadius : 18 + ((beaconProofCounts[t.to] || 0) / maxCount) * 22;
        const ux = dx / len, uy = dy / len;
        return (
          <line key={`trans-${i}`} x1={fromPos.x + ux * fromRadius} y1={fromPos.y + uy * fromRadius}
            x2={toPos.x - ux * toRadius} y2={toPos.y - uy * toRadius} stroke="#8CC63F"
            strokeWidth={1 + (t.count / maxTransition) * 2} opacity={opacity} strokeLinecap="round" />
        );
      })}

      {/* Journey overlay — one line per beacon pair with trip count */}
      {journeyTransitions.length > 0 && !(isFullscreen && fsSettings.orbitCenter) && (() => {
        const total = journeyTransitions.length;
        return journeyTransitions.map((seg, i) => {
          const fromPos = getPos(seg.from); const toPos = getPos(seg.to);
          if (!fromPos || !toPos) return null;
          const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) return null;

          // Fade: each line loses 50% opacity when a new one appears
          const age = total - 1 - i; // 0 = newest
          const opacity = 0.9 * Math.pow(0.5, age);
          if (opacity < 0.02) return null;

          // Consistent perpendicular: always compute from the "smaller" beacon
          // so both A→B and B→A use the same normal direction, just opposite side
          const isForward = seg.from < seg.to;
          const pdx = isForward ? dx : -dx;
          const pdy = isForward ? dy : -dy;
          const side = isForward ? 5 : -5;
          const nx = -pdy / len * side;
          const ny = pdx / len * side;

          const fromCount = beaconProofCounts[seg.from] || 0;
          const toCount = beaconProofCounts[seg.to] || 0;
          const fromRadius = isFullscreen ? fsSettings.beaconRadius : 18 + (fromCount / maxCount) * 22;
          const toRadius = isFullscreen ? fsSettings.beaconRadius : 18 + (toCount / maxCount) * 22;
          const ux = dx / len, uy = dy / len;
          const x1 = fromPos.x + ux * (fromRadius + 2) + nx;
          const y1 = fromPos.y + uy * (fromRadius + 2) + ny;
          const x2 = toPos.x - ux * (toRadius + 8) + nx;
          const y2 = toPos.y - uy * (toRadius + 8) + ny;

          return (
            <line key={`journey-seg-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#00D4F5" strokeWidth={0.8} opacity={opacity}
              strokeLinecap="round" markerEnd="url(#journey-arrow)"
              style={{ transition: "opacity 0.6s ease-out" }} />
          );
        });
      })()}

      {/* Beacon nodes */}
      {!(isFullscreen && fsSettings.orbitCenter) && beaconList.map((b) => {
        const pos = (localDragPos && localDragPos.id === b.id) ? localDragPos : activePositions[b.id];
        if (!pos) return null;
        if (visibleBeaconIds && !visibleBeaconIds.has(b.id)) return null;
        if (fsActiveBeaconIds && !fsActiveBeaconIds.has(b.id)) return null;
        const count = beaconProofCounts[b.id] || 0;
        const nodeRadius = isFullscreen ? fsSettings.beaconRadius : 18 + (count / maxCount) * 22;
        const color = getHeatColor(count);
        const isInJourney = journeySummary ? journeySummary.beaconIds.has(b.id) : false;
        const isJourneyStart = journeySummary ? b.id === journeySummary.startBeaconId : false;
        const isJourneyEnd = journeySummary ? b.id === journeySummary.endBeaconId : false;
        const dimmed = (!!journeySummary && !isInJourney) || (!!activeSelectedId && b.id !== activeSelectedId) || (!!filteredBeaconIds && !filteredBeaconIds.includes(b.id));
        return (
          <g key={b.id} style={{ cursor: dragging === b.id ? "grabbing" : "grab" }}
            onMouseDown={(e) => handleMouseDown(b.id, e)} onDoubleClick={(e) => handleDoubleClick(b.id, e)} opacity={dimmed ? 0.25 : 1}>
            <circle cx={pos.x} cy={pos.y} r={nodeRadius * 2.5} fill={`url(#glow-${b.id})`} />
            <circle cx={pos.x} cy={pos.y} r={nodeRadius} fill={color} opacity={0.12}
              stroke={activeSelectedId === b.id ? "#ffffff" : isJourneyStart ? "#00D4F5" : isJourneyEnd ? "#F7941D" : color}
              strokeWidth={activeSelectedId === b.id ? 3 : isInJourney ? 2.5 : 1.5}
              strokeOpacity={activeSelectedId === b.id ? 0.9 : isInJourney ? 0.8 : 0.5} />
            <circle cx={pos.x} cy={pos.y} r={nodeRadius * 0.55} fill={color} opacity={0.95} />
            <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="central"
              fill={isFullscreen ? fsSettings.textColor : "white"} fontSize={Math.max(5, nodeRadius * 0.25)}
              fontWeight="700" style={{ pointerEvents: "none" }}>{truncName(getBeaconName(b).replace(/^HW\s*/i, ""), 10)}</text>
          </g>
        );
      })}

      {/* Transition count labels */}
      {!hasJourney && !(isFullscreen && fsSettings.orbitCenter) && transitions.map((t, i) => {
        const fromPos = getPos(t.from); const toPos = getPos(t.to);
        if (!fromPos || !toPos) return null;
        const involves = activeSelectedId && (t.from === activeSelectedId || t.to === activeSelectedId);
        const filteredOut = filteredBeaconIds && (!filteredBeaconIds.includes(t.from) || !filteredBeaconIds.includes(t.to));
        const rangeHidden = visibleBeaconIds && (!visibleBeaconIds.has(t.from) || !visibleBeaconIds.has(t.to));
        const fsHidden2 = fsActiveBeaconIds && (!fsActiveBeaconIds.has(t.from) || !fsActiveBeaconIds.has(t.to));
        if ((activeSelectedId && !involves) || filteredOut || rangeHidden || fsHidden2) return null;
        return (
          <text key={`trans-label-${i}`} x={(fromPos.x + toPos.x) / 2} y={(fromPos.y + toPos.y) / 2 - 6}
            textAnchor="middle" fill="#8CC63F" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)" style={{ pointerEvents: "none" }}>
            {t.count}
          </text>
        );
      })}
    </>
  );

  // ── ANIMATED PFPs — pure CSS animation, zero JS per frame ──
  const animatedPfps = useMemo(() => {
    if (!orbitLayout || orbitLayout.length === 0) return null;
    const pr = fsSettings.pfpRadius;
    return orbitLayout.map((g) => (
      <g key={`orbits-${g.keyPrefix}`}>
        {g.ringRadii.map((r, i) => (
          <circle key={`${g.keyPrefix}-ring-${i}`} cx={g.centerX} cy={g.centerY} r={r} fill="none"
            stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} strokeDasharray="4 3" />
        ))}
        {g.items.map((item) => (
          <g key={`o-${g.keyPrefix}-${item.userId}`}
            style={{
              transformOrigin: `${item.centerX}px ${item.centerY}px`,
              animationName: 'orbit',
              animationDuration: `${item.period}s`,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              animationDelay: `${item.delayS}s`,
            }}>
            <g transform={`translate(${item.centerX + item.orbitRadius},${item.centerY})`}>
              <g style={{
                transformOrigin: '0px 0px',
                animationName: 'orbit',
                animationDuration: `${item.period}s`,
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationDirection: 'reverse',
                animationDelay: `${item.delayS}s`,
              }}>
                <circle r={pr + 1} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
                <image href={item.profilePicture} x={-pr} y={-pr} width={pr * 2} height={pr * 2}
                  clipPath={`url(#pfp-clip-${item.userId})`} style={{ pointerEvents: "none" }} />
              </g>
            </g>
          </g>
        ))}
      </g>
    ));
  }, [orbitLayout, fsSettings.pfpRadius]);

  // ── Settings panel (shared between normal and fullscreen) ──
  const settingsPanel = (
    <div
      style={{
        position: isFullscreen ? "relative" : "absolute",
        top: isFullscreen ? undefined : undefined,
        bottom: isFullscreen ? undefined : 42,
        right: isFullscreen ? undefined : 8,
        width: 220, zIndex: 30,
        background: "var(--tooltip-bg)",
        border: "1px solid var(--btn-border)", borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 12,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {/* Background color */}
      <div>
        <label className="text-[8px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--text-tertiary)" }}>Background</label>
        <div className="flex items-center gap-2">
          <input type="color" value={fsSettings.bgColor} onChange={(e) => updateFs("bgColor", e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border-0 p-0" style={{ background: "none" }} />
          <span className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>{fsSettings.bgColor}</span>
        </div>
      </div>

      {/* Text color */}
      <div>
        <label className="text-[8px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--text-tertiary)" }}>Text Color</label>
        <div className="flex items-center gap-2">
          <input type="color" value={fsSettings.textColor} onChange={(e) => updateFs("textColor", e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border-0 p-0" style={{ background: "none" }} />
          <span className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>{fsSettings.textColor}</span>
        </div>
      </div>

      {/* Show event title */}
      <div>
        <label className="text-[8px] font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer" style={{ color: "var(--text-tertiary)" }}>
          <input type="checkbox" checked={fsSettings.showTitle} onChange={(e) => updateFs("showTitle", e.target.checked)} className="w-3 h-3 accent-[#0095FF]" />
          Show Event Title
        </label>
        {fsSettings.showTitle && (
          <div className="flex flex-col gap-1.5 mt-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[7px] w-[28px]" style={{ color: "var(--text-tertiary)" }}>Size</span>
              <input type="range" min={16} max={120} value={fsSettings.titleSize} onChange={(e) => updateFs("titleSize", Number(e.target.value))} className="flex-1 h-1 accent-[#0095FF]" />
              <span className="text-[8px] w-[24px] text-right" style={{ color: "var(--text-tertiary)" }}>{fsSettings.titleSize}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[7px] w-[28px]" style={{ color: "var(--text-tertiary)" }}>Top</span>
              <input type="range" min={0} max={300} value={fsSettings.titleTop} onChange={(e) => updateFs("titleTop", Number(e.target.value))} className="flex-1 h-1 accent-[#0095FF]" />
              <span className="text-[8px] w-[24px] text-right" style={{ color: "var(--text-tertiary)" }}>{fsSettings.titleTop}</span>
            </div>
          </div>
        )}
      </div>

      {/* Only active beacons */}
      <div>
        <label className="text-[8px] font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer" style={{ color: "var(--text-tertiary)" }}>
          <input type="checkbox" checked={fsSettings.onlyActive1h} onChange={(e) => updateFs("onlyActive1h", e.target.checked)} className="w-3 h-3 accent-[#0095FF]" />
          Only Active (1h)
        </label>
      </div>

      {/* Orbit around center logo */}
      <div>
        <label className="text-[8px] font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer" style={{ color: "var(--text-tertiary)" }}>
          <input type="checkbox" checked={fsSettings.orbitCenter} onChange={(e) => updateFs("orbitCenter", e.target.checked)} className="w-3 h-3 accent-[#0095FF]" />
          Orbit Around Logo
        </label>
      </div>

      {/* Beacon radius */}
      <div>
        <label className="text-[8px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--text-tertiary)" }}>Beacon Radius</label>
        <div className="flex items-center gap-2">
          <input type="range" min={8} max={60} value={fsSettings.beaconRadius} onChange={(e) => updateFs("beaconRadius", Number(e.target.value))} className="flex-1 h-1 accent-[#0095FF]" />
          <span className="text-[8px] w-[24px] text-right" style={{ color: "var(--text-tertiary)" }}>{fsSettings.beaconRadius}</span>
        </div>
      </div>

      {/* PFP radius */}
      <div>
        <label className="text-[8px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--text-tertiary)" }}>PFP Radius</label>
        <div className="flex items-center gap-2">
          <input type="range" min={4} max={30} value={fsSettings.pfpRadius} onChange={(e) => updateFs("pfpRadius", Number(e.target.value))} className="flex-1 h-1 accent-[#0095FF]" />
          <span className="text-[8px] w-[24px] text-right" style={{ color: "var(--text-tertiary)" }}>{fsSettings.pfpRadius}</span>
        </div>
      </div>

      {/* Organizer logo */}
      <div>
        <label className="text-[8px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--text-tertiary)" }}>Organizer Logo</label>
        <div className="flex items-center gap-2 mb-1.5">
          <label style={{ background: "var(--btn-bg)", border: "1px solid var(--btn-border)", borderRadius: 6, padding: "2px 8px", fontSize: 8, fontWeight: 700, cursor: "pointer", color: "var(--text-secondary)" }}>
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, "orgLogo")} />
          </label>
          {fsSettings.orgLogo && (
            <button onClick={() => updateFs("orgLogo", null)} className="text-[8px] font-bold" style={{ color: "var(--text-tertiary)" }}>Remove</button>
          )}
        </div>
        {fsSettings.orgLogo && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[7px] w-[28px]" style={{ color: "var(--text-tertiary)" }}>Size</span>
              <input type="range" min={40} max={300} value={fsSettings.orgSize} onChange={(e) => updateFs("orgSize", Number(e.target.value))} className="flex-1 h-1 accent-[#0095FF]" />
              <span className="text-[8px] w-[24px] text-right" style={{ color: "var(--text-tertiary)" }}>{fsSettings.orgSize}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[7px] w-[28px]" style={{ color: "var(--text-tertiary)" }}>Alpha</span>
              <input type="range" min={5} max={100} value={fsSettings.orgOpacity} onChange={(e) => updateFs("orgOpacity", Number(e.target.value))} className="flex-1 h-1 accent-[#0095FF]" />
              <span className="text-[8px] w-[24px] text-right" style={{ color: "var(--text-tertiary)" }}>{fsSettings.orgOpacity}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Show sponsor toggle + logo */}
      <div>
        <label className="text-[8px] font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer mb-1" style={{ color: "var(--text-tertiary)" }}>
          <input type="checkbox" checked={fsSettings.showSponsor} onChange={(e) => updateFs("showSponsor", e.target.checked)} className="w-3 h-3 accent-[#0095FF]" />
          Show Sponsor
        </label>
        <div className="flex items-center gap-2 mb-1.5">
          <label style={{ background: "var(--btn-bg)", border: "1px solid var(--btn-border)", borderRadius: 6, padding: "2px 8px", fontSize: 8, fontWeight: 700, cursor: "pointer", color: "var(--text-secondary)" }}>
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, "sponsorLogo")} />
          </label>
          {fsSettings.sponsorLogo && (
            <button onClick={() => updateFs("sponsorLogo", null)} className="text-[8px] font-bold" style={{ color: "var(--text-tertiary)" }}>Remove</button>
          )}
        </div>
        {fsSettings.sponsorLogo && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[7px] w-[28px]" style={{ color: "var(--text-tertiary)" }}>Size</span>
              <input type="range" min={40} max={300} value={fsSettings.sponsorSize} onChange={(e) => updateFs("sponsorSize", Number(e.target.value))} className="flex-1 h-1 accent-[#0095FF]" />
              <span className="text-[8px] w-[24px] text-right" style={{ color: "var(--text-tertiary)" }}>{fsSettings.sponsorSize}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[7px] w-[28px]" style={{ color: "var(--text-tertiary)" }}>Alpha</span>
              <input type="range" min={5} max={100} value={fsSettings.sponsorOpacity} onChange={(e) => updateFs("sponsorOpacity", Number(e.target.value))} className="flex-1 h-1 accent-[#0095FF]" />
              <span className="text-[8px] w-[24px] text-right" style={{ color: "var(--text-tertiary)" }}>{fsSettings.sponsorOpacity}%</span>
            </div>
          </div>
        )}
      </div>

      {/* QR Code size */}
      <div>
        <label className="text-[8px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--text-tertiary)" }}>QR Code Size</label>
        <div className="flex items-center gap-2">
          <input type="range" min={20} max={120} value={fsSettings.qrSize} onChange={(e) => updateFs("qrSize", Number(e.target.value))} className="flex-1 h-1 accent-[#0095FF]" />
          <span className="text-[8px] w-[24px] text-right" style={{ color: "var(--text-tertiary)" }}>{fsSettings.qrSize}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="skeuo-panel h-full flex flex-col overflow-hidden relative">

      {/* ═══ FULLSCREEN VIEW (portal into popup window) ═══ */}
      {isFullscreen && popupContainer && createPortal(
        <div style={{
          width: "100vw", height: "100vh",
          background: fsSettings.bgColor,
          display: "flex", flexDirection: "column",
          fontFamily: "monospace", position: "relative",
        }}>
          {/* SVG fills full space */}
          <div ref={svgWrapRef} style={{ flex: 1, minHeight: 0, padding: 8, position: "relative" }}>
            {/* Title overlay inside widget */}
            {fsSettings.showTitle && eventName && (
              <div style={{ position: "absolute", top: fsSettings.titleTop, left: 0, right: 0, textAlign: "center", pointerEvents: "none", zIndex: 5 }}>
                <span style={{ fontSize: fsSettings.titleSize, fontWeight: 700, letterSpacing: 2, color: fsSettings.textColor }}>{eventName}</span>
              </div>
            )}
            <svg ref={svgRef} viewBox={viewBox} style={{ width: "100%", height: "100%", cursor: dragging ? "grabbing" : "default" }} preserveAspectRatio="xMidYMid meet">
              {staticSvg}
              {interactiveSvg}
              {animatedPfps}
              {/* QR Code + label */}
              {qrDataUrl && (() => {
                const qx = fsSettings.qrX - fsSettings.qrSize / 2;
                const qy = fsSettings.qrY - fsSettings.qrSize / 2;
                const fontSize = fsSettings.qrSize * 0.9 / 5.5; // ~90% of QR width for "DOWNLOAD APP"
                const gap = 5;
                return (
                  <g style={{ cursor: draggingQr ? "grabbing" : "grab" }} onMouseDown={handleQrMouseDown}>
                    <text x={qx + fsSettings.qrSize / 2} y={qy - gap}
                      textAnchor="middle" dominantBaseline="auto"
                      fill="#ffffff" fontSize={fontSize}
                      fontWeight="800" letterSpacing="0.5"
                      style={{ pointerEvents: "none" }}>
                      DOWNLOAD APP
                    </text>
                    <image href={qrDataUrl} x={qx} y={qy}
                      width={fsSettings.qrSize} height={fsSettings.qrSize}
                      style={{ pointerEvents: "none" }} />
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* Top-right controls */}
          <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8, zIndex: 20 }}>
            <button onClick={() => setShowSettings(!showSettings)}
              style={{
                width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--btn-bg)", border: "1px solid var(--btn-border)",
                opacity: showSettings ? 1 : 0.5, cursor: "pointer",
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--icon-stroke)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          {/* Settings panel + Close button */}
          {showSettings && (
            <div style={{ position: "absolute", top: 48, right: 8, zIndex: 30, display: "flex", flexDirection: "column", gap: 8 }}>
              {settingsPanel}
              <button onClick={() => {
                  const popup = popupRef.current;
                  if (!popup) return;
                  if (popup.document.fullscreenElement) {
                    popup.document.exitFullscreen();
                  } else {
                    popup.document.documentElement.requestFullscreen();
                  }
                  setShowSettings(false);
                }}
                style={{
                  height: 32, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: "linear-gradient(180deg, #1aabff 0%, #0095FF 60%, #0080dd 100%)", border: "1px solid var(--btn-border)",
                  color: "white", width: "100%",
                }}>
                Full Screen
              </button>
              <button onClick={toggleFullscreen}
                style={{
                  height: 32, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: "var(--btn-bg)", border: "1px solid var(--btn-border)",
                  color: "#00D4F5", width: "100%",
                }}>
                Close Window
              </button>
            </div>
          )}
        </div>,
        popupContainer
      )}

      {/* ═══ SCREEN 2 VIEW (portal into popup window) ═══ */}
      {isScreen2 && popup2Container && createPortal(
        <div style={{
          width: "100vw", height: "100vh",
          background: s2Settings.bgColor,
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        <div data-s2-viewport style={{
          width: S2_DESIGN_W, height: S2_DESIGN_H,
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          position: "relative", overflow: "hidden",
          transform: `scale(${s2Scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}>

          {/* ── Header: text (draggable) ── */}
          {s2Settings.headerText && (
            <div
              onMouseDown={(e) => handleS2DragStart("header", e)}
              style={{
                position: "absolute",
                left: `${s2Settings.headerX}%`, top: `${s2Settings.headerY}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 8, cursor: "grab", userSelect: "none" as const,
                display: "flex", alignItems: "center", gap: 16,
              }}
            >
              <span style={{
                fontSize: s2Settings.headerSize, fontWeight: 700,
                color: s2Settings.headerColor, letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}>
                {s2Settings.headerText}
              </span>
            </div>
          )}

          {/* ── Org logo (draggable) ── */}
          {s2Settings.orgLogo && (
            <div
              onMouseDown={(e) => handleS2DragStart("org", e)}
              style={{
                position: "absolute",
                left: `${s2Settings.orgX}%`, top: `${s2Settings.orgY}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 9, cursor: "grab", userSelect: "none" as const,
                opacity: s2Settings.orgOpacity / 100,
              }}
            >
              <img src={s2Settings.orgLogo} alt="Organizer" draggable={false}
                style={{ height: s2Settings.orgSize, width: "auto", objectFit: "contain", pointerEvents: "none" }}
              />
            </div>
          )}

          {/* ── Main card (draggable) ── */}
          <div
            onMouseDown={(e) => {
              // Only drag card from border/padding areas, not inner content
              if (e.target === e.currentTarget) handleS2DragStart("card", e);
            }}
            style={{
              position: "absolute",
              left: `${s2Settings.cardX}%`, top: `${s2Settings.cardY}%`,
              transform: "translate(-50%, -50%)",
              display: "flex", flexDirection: "row",
              border: `${s2Settings.borderWidth}px solid ${s2Settings.borderColor}`,
              width: "80%", maxWidth: 1200,
              zIndex: 10,
            }}
          >
            {/* PFP — left side */}
            <div style={{
              width: s2Settings.pfpSize, minWidth: s2Settings.pfpSize,
              flexShrink: 0, overflow: "hidden",
              aspectRatio: "1",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.15)",
            }}>
              {newestProof && profiles?.[newestProof.userId] ? (
                <img
                  key={`pfp-${newestProof.id}`}
                  src={profiles[newestProof.userId].profilePicture}
                  alt={profiles[newestProof.userId].displayName}
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 18 }}>Waiting...</span>
              )}
            </div>

            {/* Right side — two text rows */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              {/* Text 1 — name greeting (draggable moves card) */}
              <div
                onMouseDown={(e) => handleS2DragStart("text1", e)}
                style={{
                  flex: 1, display: "flex", alignItems: "center",
                  padding: "24px 40px",
                  borderBottom: `${s2Settings.borderWidth}px solid ${s2Settings.borderColor}`,
                  borderLeft: `${s2Settings.borderWidth}px solid ${s2Settings.borderColor}`,
                  cursor: "grab", userSelect: "none" as const,
                }}
              >
                <div
                  key={`t1-${newestProof?.id || "none"}`}
                  style={{
                    fontSize: s2Settings.text1Size, fontWeight: 700,
                    color: s2Settings.text1Color, lineHeight: 1.1,
                    pointerEvents: "none",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: s2Settings.text1Content
                      .replace(/\{name\}/g, newestProof && profiles?.[newestProof.userId] ? profiles[newestProof.userId].displayName : "")
                      .replace(/<br\s*\/?>/g, "<br/>"),
                  }}
                />
              </div>

              {/* Text 2 — random message (draggable moves card) */}
              <div
                onMouseDown={(e) => handleS2DragStart("text2", e)}
                style={{
                  flex: 1, display: "flex", alignItems: "center",
                  padding: "24px 40px",
                  borderLeft: `${s2Settings.borderWidth}px solid ${s2Settings.borderColor}`,
                  cursor: "grab", userSelect: "none" as const,
                }}
              >
                <div
                  key={`t2-${newestProof?.id || "none"}`}
                  style={{
                    fontSize: s2Settings.text2Size, fontWeight: 700,
                    color: s2Settings.text2Color, lineHeight: 1.1,
                    pointerEvents: "none",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: (s2Settings.messages[s2MsgIndex] || s2Settings.messages[0])
                      .replace(/\{name\}/g, newestProof && profiles?.[newestProof.userId] ? profiles[newestProof.userId].displayName : "")
                      .replace(/<br\s*\/?>/g, "<br/>"),
                  }}
                />
              </div>
            </div>
          </div>

          {/* Sponsor logo (draggable) with "sponsored by" text above */}
          {s2Settings.sponsorLogo && (
            <div
              onMouseDown={(e) => handleS2DragStart("sponsor", e)}
              style={{
                position: "absolute",
                left: `${s2Settings.sponsorX}%`, top: `${s2Settings.sponsorY}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 11, cursor: "grab", userSelect: "none" as const,
                opacity: s2Settings.sponsorOpacity / 100,
                display: "flex", flexDirection: "column", alignItems: "center",
              }}
            >
              <span style={{
                fontSize: Math.max(8, s2Settings.sponsorSize * 0.1),
                fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase",
                color: "rgba(255,255,255,0.4)", marginBottom: 4, pointerEvents: "none",
              }}>
                sponsored by
              </span>
              <img src={s2Settings.sponsorLogo} alt="Sponsor" draggable={false} style={{ width: s2Settings.sponsorSize, height: "auto", objectFit: "contain", pointerEvents: "none" }} />
            </div>
          )}

          {/* Top-right controls */}
          <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8, zIndex: 20 }}>
            <button onClick={() => setShowSettings2(!showSettings2)}
              style={{
                width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--btn-bg)", border: "1px solid var(--btn-border)",
                opacity: showSettings2 ? 1 : 0.5, cursor: "pointer",
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--icon-stroke)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          {/* Settings panel */}
          {showSettings2 && (
            <div style={{
              position: "absolute", top: 48, right: 8, zIndex: 30,
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{
                width: 250, background: "var(--tooltip-bg)",
                border: "1px solid var(--btn-border)", borderRadius: 10, padding: 12,
                display: "flex", flexDirection: "column", gap: 10,
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)", maxHeight: "80vh", overflowY: "auto",
              }}>
                {/* Background color */}
                <div>
                  <label style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4, color: "#888" }}>Background</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="color" value={s2Settings.bgColor} onChange={(e) => updateS2("bgColor", e.target.value)} style={{ width: 24, height: 24, borderRadius: 4, cursor: "pointer", border: "none", padding: 0, background: "none" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)" }}>{s2Settings.bgColor}</span>
                  </div>
                </div>

                {/* Header */}
                <div>
                  <label style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4, color: "#888" }}>Header Text</label>
                  <input type="text" value={s2Settings.headerText}
                    onChange={(e) => updateS2("headerText", e.target.value)}
                    style={{
                      width: "100%", marginBottom: 6, padding: "4px 6px", fontSize: 10, fontWeight: 600,
                      background: "var(--input-bg)", border: "1px solid var(--input-border)", borderRadius: 4,
                      color: "#ccc", outline: "none", fontFamily: "monospace",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 7, width: 28, color: "#888" }}>Color</span>
                    <input type="color" value={s2Settings.headerColor.startsWith("rgba") ? "#ffffff" : s2Settings.headerColor} onChange={(e) => updateS2("headerColor", e.target.value)} style={{ width: 20, height: 20, borderRadius: 3, cursor: "pointer", border: "none", padding: 0, background: "none" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 7, width: 28, color: "#888" }}>Size</span>
                    <input type="range" min={14} max={60} value={s2Settings.headerSize} onChange={(e) => updateS2("headerSize", Number(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#0095FF" }} />
                    <span style={{ fontSize: 8, width: 28, textAlign: "right", color: "#888" }}>{s2Settings.headerSize}</span>
                  </div>
                </div>

                {/* Card border */}
                <div>
                  <label style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4, color: "#888" }}>Card Border</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 7, width: 28, color: "#888" }}>Color</span>
                    <input type="color" value={s2Settings.borderColor.startsWith("rgba") ? "#ffffff" : s2Settings.borderColor} onChange={(e) => updateS2("borderColor", e.target.value)} style={{ width: 20, height: 20, borderRadius: 3, cursor: "pointer", border: "none", padding: 0, background: "none" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 7, width: 28, color: "#888" }}>Width</span>
                    <input type="range" min={1} max={30} value={s2Settings.borderWidth} onChange={(e) => updateS2("borderWidth", Number(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#0095FF" }} />
                    <span style={{ fontSize: 8, width: 28, textAlign: "right", color: "#888" }}>{s2Settings.borderWidth}</span>
                  </div>
                </div>

                {/* PFP Size */}
                <div>
                  <label style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4, color: "#888" }}>PFP Size</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="range" min={150} max={600} value={s2Settings.pfpSize} onChange={(e) => updateS2("pfpSize", Number(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#0095FF" }} />
                    <span style={{ fontSize: 8, width: 28, textAlign: "right", color: "#888" }}>{s2Settings.pfpSize}</span>
                  </div>
                </div>

                {/* ── Text 1 (name greeting) ── */}
                <div style={{ borderTop: "1px solid var(--input-border)", paddingTop: 10 }}>
                  <label style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6, color: "#888" }}>Text 1 (name) — use {"{name}"}</label>
                  <input type="text" value={s2Settings.text1Content}
                    onChange={(e) => updateS2("text1Content", e.target.value)}
                    style={{
                      width: "100%", marginBottom: 6, padding: "4px 6px", fontSize: 10, fontWeight: 600,
                      background: "var(--input-bg)", border: "1px solid var(--input-border)", borderRadius: 4,
                      color: "#ccc", outline: "none", fontFamily: "monospace",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 7, width: 28, color: "#888" }}>Color</span>
                    <input type="color" value={s2Settings.text1Color} onChange={(e) => updateS2("text1Color", e.target.value)} style={{ width: 20, height: 20, borderRadius: 3, cursor: "pointer", border: "none", padding: 0, background: "none" }} />
                    <span style={{ fontSize: 8, color: "#888" }}>{s2Settings.text1Color}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 7, width: 28, color: "#888" }}>Size</span>
                    <input type="range" min={16} max={120} value={s2Settings.text1Size} onChange={(e) => updateS2("text1Size", Number(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#0095FF" }} />
                    <span style={{ fontSize: 8, width: 28, textAlign: "right", color: "#888" }}>{s2Settings.text1Size}</span>
                  </div>
                </div>

                {/* ── Text 2 (random messages) ── */}
                <div style={{ borderTop: "1px solid var(--input-border)", paddingTop: 10 }}>
                  <label style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6, color: "#888" }}>Text 2 (random) — use {"{name}"}</label>
                  {s2Settings.messages.map((msg, i) => (
                    <input key={i} type="text" value={msg}
                      onChange={(e) => {
                        const newMsgs = [...s2Settings.messages] as [string, string, string, string, string];
                        newMsgs[i] = e.target.value;
                        updateS2("messages", newMsgs);
                      }}
                      style={{
                        width: "100%", marginBottom: 4, padding: "4px 6px", fontSize: 10, fontWeight: 600,
                        background: "var(--input-bg)", border: "1px solid var(--input-border)", borderRadius: 4,
                        color: "#ccc", outline: "none", fontFamily: "monospace",
                      }}
                    />
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 7, width: 28, color: "#888" }}>Color</span>
                    <input type="color" value={s2Settings.text2Color} onChange={(e) => updateS2("text2Color", e.target.value)} style={{ width: 20, height: 20, borderRadius: 3, cursor: "pointer", border: "none", padding: 0, background: "none" }} />
                    <span style={{ fontSize: 8, color: "#888" }}>{s2Settings.text2Color}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 7, width: 28, color: "#888" }}>Size</span>
                    <input type="range" min={16} max={120} value={s2Settings.text2Size} onChange={(e) => updateS2("text2Size", Number(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#0095FF" }} />
                    <span style={{ fontSize: 8, width: 28, textAlign: "right", color: "#888" }}>{s2Settings.text2Size}</span>
                  </div>
                </div>

                {/* ── Logos ── */}
                <div style={{ borderTop: "1px solid var(--input-border)", paddingTop: 10 }}>
                  <label style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4, color: "#888" }}>Organizer Logo (header)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <label style={{ background: "var(--btn-bg)", border: "1px solid var(--btn-border)", borderRadius: 6, padding: "2px 8px", fontSize: 8, fontWeight: 700, cursor: "pointer", color: "var(--text-secondary)" }}>
                      Upload
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleS2LogoUpload(e, "orgLogo")} />
                    </label>
                    {s2Settings.orgLogo && (
                      <button onClick={() => updateS2("orgLogo", null)} style={{ fontSize: 8, fontWeight: 700, color: "#666", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                    )}
                  </div>
                  {s2Settings.orgLogo && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 7, width: 28, color: "#888" }}>Size</span>
                        <input type="range" min={40} max={400} value={s2Settings.orgSize} onChange={(e) => updateS2("orgSize", Number(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#0095FF" }} />
                        <span style={{ fontSize: 8, width: 28, textAlign: "right", color: "#888" }}>{s2Settings.orgSize}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 7, width: 28, color: "#888" }}>Alpha</span>
                        <input type="range" min={5} max={100} value={s2Settings.orgOpacity} onChange={(e) => updateS2("orgOpacity", Number(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#0095FF" }} />
                        <span style={{ fontSize: 8, width: 28, textAlign: "right", color: "#888" }}>{s2Settings.orgOpacity}%</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4, color: "#888" }}>Sponsor Logo (draggable)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <label style={{ background: "var(--btn-bg)", border: "1px solid var(--btn-border)", borderRadius: 6, padding: "2px 8px", fontSize: 8, fontWeight: 700, cursor: "pointer", color: "var(--text-secondary)" }}>
                      Upload
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleS2LogoUpload(e, "sponsorLogo")} />
                    </label>
                    {s2Settings.sponsorLogo && (
                      <button onClick={() => updateS2("sponsorLogo", null)} style={{ fontSize: 8, fontWeight: 700, color: "#666", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                    )}
                  </div>
                  {s2Settings.sponsorLogo && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 7, width: 28, color: "#888" }}>Size</span>
                        <input type="range" min={40} max={400} value={s2Settings.sponsorSize} onChange={(e) => updateS2("sponsorSize", Number(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#0095FF" }} />
                        <span style={{ fontSize: 8, width: 28, textAlign: "right", color: "#888" }}>{s2Settings.sponsorSize}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 7, width: 28, color: "#888" }}>Alpha</span>
                        <input type="range" min={5} max={100} value={s2Settings.sponsorOpacity} onChange={(e) => updateS2("sponsorOpacity", Number(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#0095FF" }} />
                        <span style={{ fontSize: 8, width: 28, textAlign: "right", color: "#888" }}>{s2Settings.sponsorOpacity}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <button onClick={() => {
                  const popup = popup2Ref.current;
                  if (!popup) return;
                  if (popup.document.fullscreenElement) {
                    popup.document.exitFullscreen();
                  } else {
                    popup.document.documentElement.requestFullscreen();
                  }
                  setShowSettings2(false);
                }}
                style={{
                  height: 32, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: "linear-gradient(180deg, #1aabff 0%, #0095FF 60%, #0080dd 100%)", border: "1px solid var(--btn-border)",
                  color: "white", width: "100%",
                }}>
                Full Screen
              </button>
              <button onClick={toggleScreen2}
                style={{
                  height: 32, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: "var(--btn-bg)", border: "1px solid var(--btn-border)",
                  color: "#00D4F5", width: "100%",
                }}>
                Close Window
              </button>
            </div>
          )}

          <style>{`
            @keyframes screen2FadeIn {
              from { opacity: 0; transform: translateY(20px) scale(0.95); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
        </div>,
        popup2Container
      )}

      {/* ═══ NORMAL VIEW ═══ */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          {hasJourney ? "User Journey" : "Beacon Network"}
        </span>
        <span className="text-[9px] font-bold" style={{ color: "var(--text-tertiary)" }}>
          {beaconList.length} beacon{beaconList.length !== 1 ? "s" : ""}
          {journeySummary && ` \u00b7 ${journeySummary.beaconIds.size} zones \u00b7 ${journeySummary.edges.reduce((s, e) => s + e.trips, 0)} trips`}
        </span>
      </div>
      {!hasJourney && (
        <div className="px-3 pb-1.5 flex gap-1">
          <button onClick={() => setProofRange(null)} className="flex-1 px-1 py-0.5 rounded text-[7px] font-bold transition-all"
            style={{ background: !proofRange ? "var(--selected-bg)" : "transparent", color: !proofRange ? "var(--text-primary)" : "var(--text-tertiary)", border: !proofRange ? "1px solid var(--border-highlight)" : "1px solid transparent" }}>All</button>
          {proofRanges.map((r) => (
            <button key={r.id} onClick={() => setProofRange(proofRange === r.id ? null : r.id)} className="flex-1 px-1 py-0.5 rounded text-[7px] font-bold transition-all"
              style={{ background: proofRange === r.id ? "var(--selected-bg)" : "transparent", color: proofRange === r.id ? "var(--text-primary)" : "var(--text-tertiary)", border: proofRange === r.id ? "1px solid var(--border-highlight)" : "1px solid transparent" }}>{r.label}</button>
          ))}
          <button onClick={() => setProofRange(proofRange === "last1h" ? null : "last1h")} className="flex-1 px-1 py-0.5 rounded text-[7px] font-bold transition-all"
            style={{ background: proofRange === "last1h" ? "var(--selected-bg)" : "transparent", color: proofRange === "last1h" ? "#00D4F5" : "var(--text-tertiary)", border: proofRange === "last1h" ? "1px solid #00D4F544" : "1px solid transparent" }}>1h</button>
          <button onClick={toggleFullscreen} className="px-1.5 py-0.5 rounded text-[7px] font-bold transition-all skeuo-btn" style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>Screen 1</button>
          <button onClick={toggleScreen2} className="px-1.5 py-0.5 rounded text-[7px] font-bold transition-all skeuo-btn" style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>Screen 2</button>
        </div>
      )}
      <div className="flex-1 min-h-0 px-2 pb-2">
        <div className="skeuo-inset h-full p-1 overflow-hidden relative">
          {!isFullscreen && (
            <svg ref={svgRef} viewBox="0 0 400 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet"
              style={{ cursor: dragging ? "grabbing" : "default" }}>
              {/* Glow defs always needed */}
              {staticSvg}
              {/* PFP mode: simplified beacon nodes + moving user avatars */}
              {isPlaybackActive && viewMode === "pfps" ? (<>
                {/* Beacon circles + names/counts */}
                {(() => {
                  const pfpCounts: Record<string, number> = {};
                  if (!selectedUserId && movingPfps) {
                    for (const p of movingPfps) {
                      if (!p.moving) pfpCounts[p.beaconId] = (pfpCounts[p.beaconId] || 0) + 1;
                    }
                  }
                  return beaconList.map((b) => {
                    const pos = (localDragPos && localDragPos.id === b.id) ? localDragPos : (positions[b.id]);
                    if (!pos) return null;
                    const count = beaconProofCounts[b.id] || 0;
                    const maxC = Math.max(1, ...Object.values(beaconProofCounts));
                    const nodeRadius = 18 + (count / maxC) * 22;
                    return (
                      <g key={`pb-${b.id}`} style={{ cursor: dragging === b.id ? "grabbing" : "grab" }}
                        onMouseDown={(e) => handleMouseDown(b.id, e)}>
                        <circle cx={pos.x} cy={pos.y} r={nodeRadius} fill="rgba(255,255,255,0.04)"
                          stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
                        {!selectedUserId && (
                          <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="central"
                            fill="white" fontSize={Math.max(10, nodeRadius * 0.5)}
                            fontWeight="700" style={{ pointerEvents: "none" }}>
                            {pfpCounts[b.id] || 0}
                          </text>
                        )}
                        <text x={pos.x} y={pos.y + nodeRadius + 8} textAnchor="middle"
                          fill="rgba(255,255,255,0.5)" fontSize="6" fontWeight="600" style={{ pointerEvents: "none" }}>
                          {(names[b.id] || b.name || b.id.substring(0, 10)).substring(0, 12)}
                        </text>
                      </g>
                    );
                  });
                })()}
                {/* PFPs */}
                {movingPfps && movingPfps.map((p) => {
                  const isSolo = !!selectedUserId;
                  // Solo mode: center PFP in beacon; multi mode: use ring position
                  const beaconPos = isSolo && !p.moving ? positions[p.beaconId] : null;
                  const cx = beaconPos ? beaconPos.x : p.x;
                  const cy = beaconPos ? beaconPos.y : p.y;
                  const count = beaconProofCounts[p.beaconId] || 0;
                  const maxC = Math.max(1, ...Object.values(beaconProofCounts));
                  const nodeRadius = 18 + (count / maxC) * 22;
                  const r = isSolo && !p.moving ? Math.max(8, nodeRadius * 0.55) : 7;
                  return (
                    <g key={`mpfp-${p.userId}`}>
                      <defs>
                        <clipPath id={`mpfp-clip-${p.userId}`}>
                          <circle cx={cx} cy={cy} r={r} />
                        </clipPath>
                      </defs>
                      {p.moving && (<>
                        <circle cx={cx} cy={cy} r={r + 4} fill="rgba(0,149,255,0.08)" />
                        <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="#0095FF" strokeWidth={1} opacity={0.6} />
                      </>)}
                      <circle cx={cx} cy={cy} r={r + 0.5} fill="rgba(0,0,0,0.6)" />
                      {p.pic ? (
                        <foreignObject x={cx - r} y={cy - r} width={r * 2} height={r * 2} style={{ pointerEvents: "none" }}>
                          <img src={p.pic} alt="" referrerPolicy="no-referrer" crossOrigin="anonymous"
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} />
                        </foreignObject>
                      ) : (
                        <>
                          <circle cx={cx} cy={cy} r={r} fill="#444" />
                          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
                            fill="white" fontSize="7" fontWeight="700" style={{ pointerEvents: "none" }}>
                            {(p.name[0] || "?").toUpperCase()}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </>) : (<>
                {/* Default: transition lines, beacon nodes, labels, orbiting PFPs */}
                {interactiveSvg}
                {animatedPfps}
              </>)}
            </svg>
          )}
        </div>
      </div>

      {/* ═══ TIMELINE PLAYER ═══ */}
      {hasTimeline && !isFullscreen && (
        <div
          className="flex-shrink-0 flex items-center gap-2 px-3"
          style={{
            height: 40,
            background: "var(--inset-bg)",
            borderTop: "1px solid rgba(0,0,0,0.4)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* Play / Pause */}
          <button
            onClick={isPlaying ? handlePause : handlePlay}
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              background: isPlaying
                ? "linear-gradient(180deg, #444 0%, #333 100%)"
                : "linear-gradient(180deg, #0095FF 0%, #0077CC 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg width="8" height="8" viewBox="0 0 10 10" fill="white">
                <rect x="1.5" y="1" width="2.5" height="8" rx="0.5" />
                <rect x="6" y="1" width="2.5" height="8" rx="0.5" />
              </svg>
            ) : (
              <svg width="8" height="8" viewBox="0 0 10 10" fill="white">
                <path d="M2 1L9 5L2 9V1Z" />
              </svg>
            )}
          </button>

          {/* Stop */}
          <button
            onClick={handleStop}
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              background: "var(--selected-bg)",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
            }}
            title="Stop (live)"
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="var(--chart-label)">
              <rect x="1.5" y="1.5" width="7" height="7" rx="1" />
            </svg>
          </button>

          {/* View mode toggle */}
          <div className="flex gap-0 flex-shrink-0 rounded overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              onClick={() => setViewMode("lines")}
              className="px-1.5 py-0.5 text-[7px] font-bold"
              style={{
                background: viewMode === "lines" ? "rgba(0,149,255,0.2)" : "transparent",
                color: viewMode === "lines" ? "#0095FF" : "var(--text-tertiary)",
              }}
              title="Lines & numbers"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="2" y1="2" x2="10" y2="10" /><line x1="2" y1="10" x2="10" y2="2" />
                <circle cx="2" cy="2" r="1.5" fill="currentColor" /><circle cx="10" cy="10" r="1.5" fill="currentColor" />
                <circle cx="2" cy="10" r="1.5" fill="currentColor" /><circle cx="10" cy="2" r="1.5" fill="currentColor" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("pfps")}
              className="px-1.5 py-0.5 text-[7px] font-bold"
              style={{
                background: viewMode === "pfps" ? "rgba(0,149,255,0.2)" : "transparent",
                color: viewMode === "pfps" ? "#0095FF" : "var(--text-tertiary)",
              }}
              title="PFP avatars"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <circle cx="6" cy="4" r="2.5" /><path d="M2 11c0-2.2 1.8-4 4-4s4 1.8 4 4" />
              </svg>
            </button>
          </div>

          {/* Scrubber */}
          <div className="flex-1 relative flex items-center" style={{ height: 18 }}>
            <div className="absolute inset-x-0 rounded-full"
              style={{ height: 3, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)" }} />
            <div className="absolute rounded-full"
              style={{
                height: 3, top: "50%", transform: "translateY(-50%)", left: 0,
                width: `${eventEndTime! > eventStartTime! ? ((localPlaybackTime - eventStartTime!) / (eventEndTime! - eventStartTime!)) * 100 : 0}%`,
                background: "linear-gradient(90deg, #0095FF, #00C6FF)", boxShadow: "0 0 6px rgba(0,149,255,0.4)",
              }} />
            <input type="range" min={eventStartTime} max={eventEndTime} step={1} value={localPlaybackTime} onChange={handleScrub}
              className="timeline-scrubber"
              style={{ width: "100%", position: "relative", zIndex: 1, appearance: "none", WebkitAppearance: "none", background: "transparent", height: 18, cursor: "pointer" }} />
          </div>

          {/* Time display */}
          <span className="text-[8px] font-mono font-bold flex-shrink-0" style={{ color: isPlaybackActive ? "#0095FF" : "var(--text-tertiary)" }}>
            {new Date(localPlaybackTime * 1000).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>

          {/* Speed buttons */}
          <div className="flex gap-0.5 flex-shrink-0">
            {[10, 50, 100, 1000, 5000].map((s) => (
              <button key={s} onClick={() => setPlaySpeed(s)}
                className="px-1 py-0.5 rounded text-[7px] font-bold"
                style={{
                  background: playSpeed === s ? "linear-gradient(180deg, #0095FF 0%, #0077CC 100%)" : "transparent",
                  color: playSpeed === s ? "#fff" : "var(--text-tertiary)",
                  border: playSpeed === s ? "1px solid rgba(0,149,255,0.4)" : "1px solid transparent",
                }}>
                {s >= 1000 ? `${s/1000}k` : s}x
              </button>
            ))}
          </div>

          <style>{`
            .timeline-scrubber::-webkit-slider-thumb {
              -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
              background: linear-gradient(180deg, #fff 0%, #ccc 100%); border: 1px solid rgba(0,0,0,0.3);
              box-shadow: 0 1px 3px rgba(0,0,0,0.4); cursor: pointer;
            }
            .timeline-scrubber::-moz-range-thumb {
              width: 10px; height: 10px; border-radius: 50%;
              background: linear-gradient(180deg, #fff 0%, #ccc 100%); border: 1px solid rgba(0,0,0,0.3);
              box-shadow: 0 1px 3px rgba(0,0,0,0.4); cursor: pointer;
            }
            .timeline-scrubber::-webkit-slider-runnable-track { height: 3px; background: transparent; }
            .timeline-scrubber::-moz-range-track { height: 3px; background: transparent; }
          `}</style>
        </div>
      )}

      {/* Rename overlay */}
      {editingBeacon && (
        <div className="absolute z-10" style={{ left: editPos.x - 60, top: editPos.y }}>
          <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingBeacon(null); }}
            className="skeuo-input px-2 py-1 text-[11px] font-bold w-[120px]" />
        </div>
      )}

      {/* Settings gear — bottom right */}
      {!isFullscreen && (
        <button onClick={() => setShowSettings(!showSettings)}
          style={{
            position: "absolute", bottom: hasTimeline ? 52 : 12, right: 12, zIndex: 20,
            width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--btn-bg)", border: "1px solid var(--btn-border)",
            cursor: "pointer", opacity: showSettings ? 1 : 0.5,
          }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={showSettings ? "#0095FF" : "var(--icon-stroke)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      {/* Settings panel (normal view) */}
      {!isFullscreen && showSettings && settingsPanel}

      <style jsx>{`
        @keyframes dashMove { to { stroke-dashoffset: -20; } }
        .animate-dash { animation: dashMove 1s linear infinite; }
      `}</style>
    </div>
  );
}
