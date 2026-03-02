import {
  AnalyticsResponse,
  ProcessedData,
  UserDetail,
  Proof,
} from "@/types";

export function processAnalytics(data: AnalyticsResponse): ProcessedData {
  const { event, proofs, beacons, profiles, lastUpdate } = data;

  // Group proofs by user
  const userProofs: Record<string, Proof[]> = {};
  for (const p of proofs) {
    if (!userProofs[p.userId]) userProofs[p.userId] = [];
    userProofs[p.userId].push(p);
  }

  // Sort each user's proofs by time
  for (const uid of Object.keys(userProofs)) {
    userProofs[uid].sort((a, b) => a.time - b.time);
  }

  const now = Math.floor(Date.now() / 1000);
  const eventEnd = event.endTime;
  const isEventOver = now > eventEnd;

  // Determine presence: a user is "currently present" if their last proof
  // was within the last 30 minutes (for ongoing events)
  const PRESENCE_THRESHOLD = 30 * 60; // 30 minutes

  let currentlyPresent = 0;
  let alreadyLeft = 0;
  const totalAttendees = Object.keys(userProofs).length;

  for (const uid of Object.keys(userProofs)) {
    const lastProofTime = userProofs[uid][userProofs[uid].length - 1].time;
    if (isEventOver) {
      alreadyLeft++;
    } else if (now - lastProofTime < PRESENCE_THRESHOLD) {
      currentlyPresent++;
    } else {
      alreadyLeft++;
    }
  }

  // Beacon proof counts
  const beaconProofCounts: Record<string, number> = {};
  for (const p of proofs) {
    beaconProofCounts[p.beaconId] = (beaconProofCounts[p.beaconId] || 0) + 1;
  }

  // User beacon transitions (user goes from beacon A to beacon B)
  const transitionMap: Record<string, number> = {};
  for (const uid of Object.keys(userProofs)) {
    const ups = userProofs[uid];
    for (let i = 1; i < ups.length; i++) {
      if (ups[i].beaconId !== ups[i - 1].beaconId) {
        const key = [ups[i - 1].beaconId, ups[i].beaconId].sort().join("||");
        transitionMap[key] = (transitionMap[key] || 0) + 1;
      }
    }
  }
  const userBeaconTransitions = Object.entries(transitionMap).map(
    ([key, count]) => {
      const [from, to] = key.split("||");
      return { from, to, count };
    }
  );

  // Check-in timeline (first proof per user, bucketed by 10 min)
  // Check-out timeline: only users who left (last proof > 30 min ago, or event over)
  const checkInEntries: { time: number; userId: string }[] = [];
  const checkOutEntries: { time: number; userId: string }[] = [];
  for (const uid of Object.keys(userProofs)) {
    checkInEntries.push({ time: userProofs[uid][0].time, userId: uid });
    const lastProofTime = userProofs[uid][userProofs[uid].length - 1].time;
    if (isEventOver || now - lastProofTime >= PRESENCE_THRESHOLD) {
      checkOutEntries.push({ time: lastProofTime, userId: uid });
    }
  }

  const checkInTimeline = bucketByInterval(checkInEntries);
  const checkOutTimeline = bucketByInterval(checkOutEntries);

  // Dwell times
  const dwellTimes = Object.keys(userProofs).map((uid) => {
    const ups = userProofs[uid];
    const minutes = (ups[ups.length - 1].time - ups[0].time) / 60;
    return { userId: uid, minutes: Math.round(minutes) };
  });

  // User details
  const userDetails: UserDetail[] = Object.keys(userProofs).map((uid) => {
    const ups = userProofs[uid];
    const beaconsVisited = [...new Set(ups.map((p) => p.beaconId))];
    const lastProofTime = ups[ups.length - 1].time;
    const isPresent = !isEventOver && (now - lastProofTime < PRESENCE_THRESHOLD);
    return {
      userId: uid,
      profile: profiles[uid] || null,
      firstProof: ups[0].time,
      lastProof: lastProofTime,
      dwellMinutes: Math.round((lastProofTime - ups[0].time) / 60),
      beaconsVisited,
      proofCount: ups.length,
      beaconTimeline: ups.map((p) => ({
        beaconId: p.beaconId,
        time: p.time,
      })),
      status: isPresent ? "present" : "left",
    };
  });

  const avgDwellMinutes = dwellTimes.length > 0
    ? Math.round(dwellTimes.reduce((s, d) => s + d.minutes, 0) / dwellTimes.length)
    : 0;

  return {
    event,
    proofs,
    beacons,
    profiles,
    lastUpdate,
    totalAttendees,
    currentlyPresent,
    alreadyLeft,
    avgDwellMinutes,
    beaconProofCounts,
    userBeaconTransitions,
    checkInTimeline,
    checkOutTimeline,
    dwellTimes,
    userDetails,
  };
}

function bucketByInterval(
  entries: { time: number; userId: string }[]
): { time: number; count: number; userIds: string[] }[] {
  if (entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => a.time - b.time);
  const minTime = sorted[0].time;
  const maxTime = sorted[sorted.length - 1].time;

  // Bucket into 10-minute intervals
  const bucketSize = 600;
  const startBucket = Math.floor(minTime / bucketSize) * bucketSize;
  const endBucket = Math.floor(maxTime / bucketSize) * bucketSize;

  const buckets: Record<number, string[]> = {};
  for (let t = startBucket; t <= endBucket; t += bucketSize) {
    buckets[t] = [];
  }

  for (const e of sorted) {
    const bucket = Math.floor(e.time / bucketSize) * bucketSize;
    if (!buckets[bucket]) buckets[bucket] = [];
    buckets[bucket].push(e.userId);
  }

  return Object.entries(buckets)
    .map(([time, userIds]) => ({ time: Number(time), count: userIds.length, userIds }))
    .sort((a, b) => a.time - b.time);
}

export function mergeAnalytics(
  existing: AnalyticsResponse,
  update: AnalyticsResponse
): AnalyticsResponse {
  // Merge proofs (avoid duplicates by id)
  const existingIds = new Set(existing.proofs.map((p) => p.id));
  const newProofs = update.proofs.filter((p) => !existingIds.has(p.id));

  return {
    event: update.event || existing.event,
    proofs: [...existing.proofs, ...newProofs],
    beacons: { ...existing.beacons, ...update.beacons },
    profiles: { ...existing.profiles, ...update.profiles },
    lastUpdate: update.lastUpdate,
  };
}
