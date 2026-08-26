/**
 * Shared recharts styling, matched to the sibling ecobank-alm-platform
 * build so a chart looks like it belongs to the same product regardless of
 * which screen it's on.
 */

export const CHART_COLORS = {
  primary: '#01607E',
  accent: '#B6CB2A',
  neutral: '#83858C',
};

export const CHART_AXIS_TICK = { fontSize: 11, fill: '#9AA1AE' };
export const CHART_GRID_STROKE = '#f1f3f5';

export const CHART_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: 'none',
  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
} as const;

export const CHART_LEGEND_STYLE = { fontSize: 12 };
