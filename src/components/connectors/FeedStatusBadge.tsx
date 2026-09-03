import { StatusBadge } from '@/components/ui/StatusBadge';
import { STATUS_LABEL, STATUS_TONE } from './connectorConstants';
import type { Connector, DomainFeed } from '@/engine/types';

/**
 * Picking "Connector" mode and a connector from the dropdown is a mapping decision, not proof the
 * connection actually works - a badge reading "Connected" the moment it's selected would claim more
 * than is known, especially for a newly onboarded affiliate that hasn't verified anything yet. This
 * reflects the connector's own real status instead.
 */
export function FeedStatusBadge({ feed, connectors }: { feed: DomainFeed; connectors: Connector[] }) {
  if (feed.mode === 'File') return <StatusBadge status="File feed" tone="warning" />;
  if (feed.mode === 'NotConfigured') return <StatusBadge status="Not configured" tone="neutral" />;

  if (!feed.connectorId) return <StatusBadge status="Not selected" tone="warning" />;
  const connector = connectors.find((c) => c.id === feed.connectorId);
  if (!connector) return <StatusBadge status="Connector missing" tone="danger" />;
  return <StatusBadge status={STATUS_LABEL[connector.status]} tone={STATUS_TONE[connector.status]} />;
}
