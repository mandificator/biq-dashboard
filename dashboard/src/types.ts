export interface EventData {
  id: string;
  clientId: string;
  organizerId: string[];
  type: string;
  name: string;
  description: string;
  tags: string[];
  url: string;
  locations: {
    id: string;
    name: string;
    address: string;
    mapLink: string;
    geofence: { lat: number; lng: number; radius: number };
    allowUserBeacons: boolean;
  }[];
  timezone: string;
  startTime: number;
  endTime: number;
  participation: string;
  isGated: boolean;
  createdAt: number;
  image: string;
  visibility: string;
  updatedAt: number;
}

export interface LumaGuest {
  api_id: string;
  name: string;
  email: string;
  solana_address: string;
}

export interface Proof {
  id: string;
  clientId: string;
  time: number;
  nonce: string;
  userId: string;
  beaconId: string;
  eventId: string[];
  participation: { event: string }[];
}

export interface Beacon {
  id: string;
  type: string;
  position?: { lat: number; lng: number };
  disabled?: boolean;
  createdAt?: number;
  updatedAt?: number;
  name: string;
}

export interface Profile {
  id: string;
  displayName: string;
  profilePicture: string;
  createdAt?: number;
}

export interface AnalyticsResponse {
  event: EventData;
  proofs: Proof[];
  beacons: Record<string, Beacon>;
  profiles: Record<string, Profile>;
  lastUpdate: number;
}

export interface ProcessedData {
  event: EventData;
  proofs: Proof[];
  beacons: Record<string, Beacon>;
  profiles: Record<string, Profile>;
  lastUpdate: number;
  // Computed
  totalAttendees: number;
  currentlyPresent: number;
  alreadyLeft: number;
  avgDwellMinutes: number;
  beaconProofCounts: Record<string, number>;
  userBeaconTransitions: { from: string; to: string; count: number }[];
  checkInTimeline: { time: number; count: number; userIds: string[] }[];
  checkOutTimeline: { time: number; count: number; userIds: string[] }[];
  dwellTimes: { userId: string; minutes: number }[];
  userDetails: UserDetail[];
}

export interface UserDetail {
  userId: string;
  profile: Profile | null;
  firstProof: number;
  lastProof: number;
  dwellMinutes: number;
  beaconsVisited: string[];
  proofCount: number;
  beaconTimeline: { beaconId: string; time: number }[];
  status: "present" | "left";
}

export interface EventListItem {
  id: string;
  name: string;
  image: string;
  organizerId: string[];
  startTime: number;
  endTime: number;
  locations: {
    id: string;
    name: string;
    address: string;
  }[];
  visibility: string;
  isPublic?: boolean;
  isGated: boolean;
}

export interface OrganizerInfo {
  id: string;
  name: string;
  logo: string;
  description: string;
  status?: string;
}

export interface CrossEventAnalysis {
  sharedUsers: {
    userId: string;
    eventIds: string[];
    totalProofs: number;
    totalDwell: number;
  }[];
  eventMetrics: {
    eventId: string;
    eventName: string;
    totalAttendees: number;
    avgDwellMinutes: number;
    uniqueBeacons: number;
    totalProofs: number;
    peakConcurrent: number;
  }[];
  overlapMatrix: {
    eventA: string;
    eventB: string;
    sharedCount: number;
  }[];
}
