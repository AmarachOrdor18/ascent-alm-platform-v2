import { Redirect, useRoute } from 'wouter';

/**
 * The old read-only "View" page — its content (profile, currencies, balance sheet, feed freshness)
 * now lives in AffiliateSettings.tsx's "Overview" category, so this route is kept only so an old
 * link or bookmark to `/affiliates/:code` still lands somewhere useful instead of 404ing.
 */
export function AffiliateDetail() {
  const [, params] = useRoute('/affiliates/:code');
  return <Redirect to={params?.code ? `/affiliates/${params.code}/settings` : '/affiliates'} />;
}
