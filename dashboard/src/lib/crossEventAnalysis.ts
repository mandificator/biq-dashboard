import { ProcessedData, CrossEventAnalysis } from "@/types";

export function analyzeCrossEvents(
  datasets: { eventId: string; data: ProcessedData }[]
): CrossEventAnalysis {
  // Map userId → set of eventIds
  const userEvents: Record<string, Set<string>> = {};
  // Map userId → { totalProofs, totalDwell } across events
  const userStats: Record<string, { totalProofs: number; totalDwell: number }> = {};

  for (const { eventId, data } of datasets) {
    for (const user of data.userDetails) {
      if (!userEvents[user.userId]) {
        userEvents[user.userId] = new Set();
        userStats[user.userId] = { totalProofs: 0, totalDwell: 0 };
      }
      userEvents[user.userId].add(eventId);
      userStats[user.userId].totalProofs += user.proofCount;
      userStats[user.userId].totalDwell += user.dwellMinutes;
    }
  }

  // All users across events
  const sharedUsers = Object.entries(userEvents)
    .map(([userId, events]) => ({
      userId,
      eventIds: Array.from(events),
      totalProofs: userStats[userId].totalProofs,
      totalDwell: userStats[userId].totalDwell,
    }))
    .sort((a, b) => b.eventIds.length - a.eventIds.length || b.totalProofs - a.totalProofs);

  // Per-event metrics
  const eventMetrics = datasets.map(({ eventId, data }) => {
    // Peak concurrent: max count in check-in timeline minus check-outs
    let peakConcurrent = 0;
    const checkInMap: Record<number, number> = {};
    for (const bucket of data.checkInTimeline) {
      checkInMap[bucket.time] = bucket.count;
    }
    const checkOutMap: Record<number, number> = {};
    for (const bucket of data.checkOutTimeline) {
      checkOutMap[bucket.time] = bucket.count;
    }
    // Simple peak: just max check-in bucket count
    peakConcurrent = data.checkInTimeline.reduce((max, b) => Math.max(max, b.count), 0);

    return {
      eventId,
      eventName: data.event.name,
      totalAttendees: data.totalAttendees,
      avgDwellMinutes: data.avgDwellMinutes,
      uniqueBeacons: Object.keys(data.beacons).length,
      totalProofs: data.proofs.length,
      peakConcurrent,
    };
  });

  // Overlap matrix: for each pair of events, count shared users
  const overlapMatrix: CrossEventAnalysis["overlapMatrix"] = [];
  for (let i = 0; i < datasets.length; i++) {
    const usersA = new Set(datasets[i].data.userDetails.map((u) => u.userId));
    for (let j = i + 1; j < datasets.length; j++) {
      const usersB = new Set(datasets[j].data.userDetails.map((u) => u.userId));
      let sharedCount = 0;
      for (const uid of usersA) {
        if (usersB.has(uid)) sharedCount++;
      }
      overlapMatrix.push({
        eventA: datasets[i].eventId,
        eventB: datasets[j].eventId,
        sharedCount,
      });
    }
  }

  return { sharedUsers, eventMetrics, overlapMatrix };
}
