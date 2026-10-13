import { createProductNewsHistoryLoader, selectProductNewsHistory } from './product-news.mjs';
import fallbackReleases from './public-news-fallback.json';

export type PublicFeatureHighlight = {
  title: string;
  summary: string;
  date: string;
  publishedAt: string;
  updatedAt: string;
  tag: string;
  prerelease: boolean;
  href: string;
};

// Reviewed copy backed by the matching CHANGELOG.md entries and public release dates.
// Both surfaces share one feed cache and retain recent history during outages.
export const loadProductNewsHistory: () => Promise<PublicFeatureHighlight[]> = createProductNewsHistoryLoader(selectProductNewsHistory(fallbackReleases));
export const loadProductNews = async () => (await loadProductNewsHistory())[0] ?? null;
