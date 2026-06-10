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

  // Audience growth: for each event in chronological order, how many
  // attendees were new vs returning (seen at an earlier selected event),
  // plus the cumulative unique audience. Duration-agnostic, so events of
  // different scope and length stay comparable.
  const ordered = [...datasets].sort((a, b) => a.data.event.startTime - b.data.event.startTime);
  const seen = new Set<string>();
  const growth = ordered.map(({ eventId, data }) => {
    let newUsers = 0, returningUsers = 0;
    for (const u of data.users) {
      if (seen.has(u.userId)) returningUsers++;
      else newUsers++;
    }
    for (const u of data.users) seen.add(u.userId);
    return {
      eventId,
      eventName: data.event.name,
      startTime: data.event.startTime,
      newUsers,
      returningUsers,
      cumulativeUnique: seen.size,
    };
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

  return { sharedUsers, eventMetrics, growth, overlapMatrix };
}
