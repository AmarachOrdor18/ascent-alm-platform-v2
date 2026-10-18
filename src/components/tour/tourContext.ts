// Split out of Tour.tsx so this file only exports components - fast-refresh needs that to hot-reload without losing state.
import { createContext, useContext } from 'react';
import type { TourStep } from './tourTypes';
import type { TourDef } from './tourSteps';

export type TourDirection = 'forward' | 'back';

export interface TourContextValue {
  open: boolean;
  /** Every tour this role can take; the first is Getting started. */
  tours: TourDef[];
  activeTourId: string;
  steps: TourStep[];
  stepIndex: number;
  direction: TourDirection;
  /** Starts a tour by id (default: Getting started). */
  start: (tourId?: string) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  finish: () => void;
  /** Skip the current step in the direction the user was travelling - used when a target never appears. */
  passOver: () => void;
}

export const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}
