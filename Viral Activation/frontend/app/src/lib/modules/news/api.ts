import { httpGet } from "../../api/http";
import type {
  AppNewsItemResponse,
  AppNewsResponse,
  HotSignal,
  HotSignalImpact,
  HotSignalsQuery
} from "./types";

const APP_NEWS_ENDPOINT = "/api/v1/app/news";

function deriveImpact(text: string): HotSignalImpact {
  const normalized = text.toLowerCase();
  if (
    normalized.includes("injur") ||
    normalized.includes("suspend") ||
    normalized.includes("out ") ||
    normalized.includes("breaking")
  ) {
    return "HIGH";
  }

  if (
    normalized.includes("lineup") ||
    normalized.includes("start") ||
    normalized.includes("confirmed") ||
    normalized.includes("transfer")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function normalizeItem(item: AppNewsItemResponse): HotSignal {
  const summary = item.summary?.trim() ?? "No summary";
  return {
    id: item.id,
    title: item.title,
    summary,
    url: item.url,
    imageUrl: item.imageUrl,
    sourceName: item.sourceName,
    publishedAt: item.publishedAt,
    impact: deriveImpact(`${item.title} ${summary}`)
  };
}

function buildQueryString(query: HotSignalsQuery): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  if (query.language) params.set("language", query.language);
  if (query.competition) params.set("competition", query.competition);
  if (query.q) params.set("q", query.q);

  return params.size > 0 ? `?${params.toString()}` : "";
}

export async function fetchHotSignals(query: HotSignalsQuery = {}): Promise<HotSignal[]> {
  const safeLimit = query.limit ?? 5;
  const response = await httpGet<AppNewsResponse>(
    `${APP_NEWS_ENDPOINT}${buildQueryString({ ...query, limit: safeLimit })}`
  );

  return response.items
    .slice(0, safeLimit)
    .map(normalizeItem)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
