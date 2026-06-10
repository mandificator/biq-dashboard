import { EventSummary, CrossEventAnalysis } from "@/types";

export function analyzeCrossEvents(
  datasets: { eventId: string; data: EventSummary }[]
): CrossEventAnalysis {
  // Map userId → set of eventIds
  const userEvents: Record<string, Set<string>> = {};
  // Map userId → { totalProofs, totalDwell } across events
  const userStats: Record<string, { totalProofs: number; totalDwell: number }> = {};

  for (const { eventId, data } of datasets) {
    for (const user of data.users) {
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
  const eventMetrics = datasets.map(({ eventId, data }) => ({
    eventId,
    eventName: data.event.name,
    totalAttendees: data.totalAttendees,
    avgDwellMinutes: data.avgDwellMinutes,
    uniqueBeacons: data.uniqueBeacons,
    totalProofs: data.totalProofs,
    peakConcurrent: data.peakConcurrent,
  }));

  // Presence curves aligned to minutes-from-event-start so different
  // events can be overlaid and compared shape-to-shape.
  const presenceCurves = datasets.map(({ eventId, data }) => {
    const start = data.event.startTime;
    const points = data.presenceTimeline.map((b) => ({
      minute: Math.round((b.time - start) / 60),
      count: b.count,
    }));
    return { eventId, eventName: data.event.name, points };
  });

  // Overlap matrix: for each pair of events, count shared users
  const overlapMatrix: CrossEventAnalysis["overlapMatrix"] = [];
  for (let i = 0; i < datasets.length; i++) {
    const usersA = new Set(datasets[i].data.users.map((u) => u.userId));
    for (let j = i + 1; j < datasets.length; j++) {
      const usersB = new Set(datasets[j].data.users.map((u) => u.userId));
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

  return { sharedUsers, eventMetrics, presenceCurves, overlapMatrix };
}
