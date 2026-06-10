/**
 * Unified chart palette. Every single-series chart uses the brand accent;
 * paired series use the two blues; only multi-event comparisons use the
 * categorical palette (harmonized, ordered by visual weight).
 */
export const CHART_PRIMARY = "#0095FF";
export const CHART_SECONDARY = "#67BDFF";

export const EVENT_COLORS = [
  "#0095FF", // brand blue
  "#7C6CFF", // violet
  "#00BFA6", // teal
  "#FFB020", // amber
  "#FF6480", // rose
];

export function eventColor(index: number): string {
  return EVENT_COLORS[index % EVENT_COLORS.length];
}
