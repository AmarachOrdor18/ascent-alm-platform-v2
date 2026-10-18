// React form of the market-data aftermath (lib/marketDataEvents.ts) for screens that save market data by
// hand - the FX rates and yield curves pages - so a manual save audits, notifies the affected affiliates and
// recalculates readiness exactly like an uploaded file does.
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { afterMarketDataLoad, type MarketDataLoad } from './marketDataEvents';
import { invalidateReadinessInputs } from './readinessHooks';
import { notificationKeys } from './notificationHooks';

export function useMarketDataSaved(): (load: MarketDataLoad) => void {
  const qc = useQueryClient();
  const { user } = useAuth();
  return (load) => {
    invalidateReadinessInputs(qc);
    void afterMarketDataLoad(load, user ? { id: user.id, name: user.name, role: user.role } : null).then(() => {
      void qc.invalidateQueries({ queryKey: ['auditEvents'] });
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    });
  };
}
