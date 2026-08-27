// Split out of Tour.tsx so this file only exports components — fast-refresh needs that to hot-reload without losing state.
import { createContext, useContext } from 'react';
import type { TourStep } from './tourSteps';

export interface TourContextValue {
  active: boolean;
  step: TourStep | null;
  stepIndex: number;
  stepCount: number;
  start: () => void;
  next: () => void;
  back: () => void;
  exit: () => void;
}

export const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}
