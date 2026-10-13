import { createProductNewsLoader, selectProductNews } from './product-news.mjs';

// Bundled fallback from merged commit 6eb0f046b46c6734dfdbfb0c46fda85d6e91f1b5,
// CHANGELOG.md 0.50.0-rc.1. The existing release CI supplies future highlights.
const fallback = selectProductNews([{
  tag_name: 'v0.50.0-rc.1',
  draft: false,
  prerelease: true,
  published_at: '2026-10-11T03:10:14Z',
  body: '### Website highlight\n\n- Automatic refunds in Workato: Let a Workato recipe handle eligible refunds within a $100 limit, then check the evidence for each outcome. This preview uses synthetic USD refunds.\n\n### Added\n\n- Automatic Workato synthetic-refund policy path.',
}]);

export const loadProductNews = createProductNewsLoader(fallback);
