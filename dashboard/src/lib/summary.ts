import { AnalyticsResponse, EventSummary, OrganizerInfo } from "@/types";
import { processAnalytics } from "./processData";

/**
 * Reduce a raw analytics payload (often >1MB) to the compact summary the
 * organizer dashboard needs (~tens of KB). Runs server-side.
 */
export function buildEventSummary(
  data: AnalyticsResponse & { organizers?: Record<string, OrganizerInfo> }
): EventSummary {
  const processed = processAnalytics(data);

  return {
    event: processed.event,
    lastUpdate: processed.lastUpdate,
    totalAttendees: processed.totalAttendees,
    currentlyPresent: processed.currentlyPresent,
    avgDwellMinutes: processed.avgDwellMinutes,
    totalProofs: processed.proofs.length,
    uniqueBeacons: Object.keys(processed.beacons).length,
    peakConcurrent: processed.peakConcurrent,
    presenceTimeline: processed.presenceTimeline,
    users: processed.userDetails.map((u) => ({
      userId: u.userId,
      displayName: u.profile?.displayName || "",
      profilePicture: u.profile?.profilePicture || "",
      dwellMinutes: u.dwellMinutes,
      proofCount: u.proofCount,
      firstProof: u.firstProof,
      lastProof: u.lastProof,
      status: u.status,
    })),
    organizers: data.organizers,
  };
}
