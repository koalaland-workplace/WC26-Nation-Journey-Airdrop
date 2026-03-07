export type HotSignalImpact = "HIGH" | "MEDIUM" | "LOW";

export interface AppNewsItemResponse {
  id: string;
  provider: string;
  title: string;
  summary: string | null;
  url: string | null;
  imageUrl: string | null;
  sourceName: string | null;
  language: string;
  competition: string | null;
  publishedAt: string;
  createdAt: string;
}

export interface AppNewsResponse {
  items: AppNewsItemResponse[];
  total: number;
}

export interface HotSignalsQuery {
  limit?: number;
  offset?: number;
  language?: string;
  competition?: string;
  q?: string;
}

export interface HotSignal {
  id: string;
  title: string;
  summary: string;
  url: string | null;
  imageUrl: string | null;
  sourceName: string | null;
  publishedAt: string;
  impact: HotSignalImpact;
}

export const DEFAULT_HOT_SIGNALS: HotSignal[] = [
  {
    id: "default-1",
    title: "Mbappe returns to partial training before quarter-final",
    summary: "France coaching staff confirm controlled minutes in final prep.",
    url: null,
    imageUrl: null,
    sourceName: "WC26 Desk",
    publishedAt: new Date().toISOString(),
    impact: "HIGH"
  },
  {
    id: "default-2",
    title: "England test double-pivot in tactical drill",
    summary: "Coaching team trials a more defensive midfield pairing.",
    url: null,
    imageUrl: null,
    sourceName: "WC26 Desk",
    publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    impact: "MEDIUM"
  },
  {
    id: "default-3",
    title: "Brazil increase set-piece workload in closed session",
    summary: "Extra focus on corners and second-ball transitions.",
    url: null,
    imageUrl: null,
    sourceName: "WC26 Desk",
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    impact: "MEDIUM"
  },
  {
    id: "default-4",
    title: "Argentina captain completes full-contact block",
    summary: "Fitness staff report positive response after previous precaution.",
    url: null,
    imageUrl: null,
    sourceName: "WC26 Desk",
    publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    impact: "LOW"
  },
  {
    id: "default-5",
    title: "Spain commit to youth striker as confirmed starter",
    summary: "Manager confirms lineup change in pre-match conference.",
    url: null,
    imageUrl: null,
    sourceName: "WC26 Desk",
    publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    impact: "HIGH"
  }
];
