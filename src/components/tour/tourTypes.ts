/**
 * One tour step = one feature. The engine (Tour.tsx) navigates to `route`, performs `click` / `fill`,
 * waits for `selector` to exist and stop moving, then spotlights it. A step whose target never
 * appears (role lacks the permission, nothing to show) is skipped in the direction of travel.
 */
export interface TourStep {
  /**
   * Route to be on, including any query string. Empty string = stay wherever the previous step
   * left off (e.g. inside a panel opened by clicking a row). A route with no query string also
   * closes any panel or modal a previous step opened.
   */
  route: string;
  /** Element to spotlight; null = centred card with no spotlight (welcome, finish). */
  selector: string | null;
  title: string;
  /** One or two short sentences: what it is, and why or when you'd use it. */
  body: string;
  /** Clicked before resolving `selector` - tabs, filters, toggles. */
  click?: string;
  /** Typed into first (React-safe), e.g. a table search so the wanted row is on page one. */
  fill?: { selector: string; value: string };
  /** Pressing Next clicks the target (a row's View button, a button that opens a pop-up). */
  clickOnNext?: boolean;
  /** Card label override; otherwise the page name is derived from the route. */
  section?: string;
}

/** Selector helpers - steps reference shared markers, not one-off ids. */
export const sel = {
  tour: (name: string) => `[data-tour="${name}"]`,
  drawer: (inner = '') => `[data-tour="drawer"]${inner ? ` ${inner}` : ''}`,
  tab: (key: string) => `[data-tour="drawer"] [data-tour-tab="${key}"]`,
  pageTab: (key: string) => `[data-tour-tab="${key}"]`,
  section: (title: string) => `[data-tour-section="${title}"]`,
  panel: (title: string) => `[data-tour-panel="${title}"]`,
  row: (key: string) => `[data-tour-row="${key}"]`,
  viewRow: (key: string) => `[data-tour-row="${key}"] [data-tour="row-view"]`,
  firstView: (scope = '') => `${scope ? `${scope} ` : ''}[data-tour="row-view"]`,
};
