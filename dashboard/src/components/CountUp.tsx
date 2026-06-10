"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number to its target with ease-out; re-animates from the
 * previous value when the target changes (live refreshes feel alive).
 */
export default function CountUp({
  value,
  format,
  duration = 800,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      prevRef.current = value;
      setDisplay(value);
      return;
    }
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;
    if (from === to) { setDisplay(to); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format ? format(display) : display.toLocaleString()}</>;
}
