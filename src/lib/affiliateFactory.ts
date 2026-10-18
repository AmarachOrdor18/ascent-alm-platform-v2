// The one place a brand-new affiliate record is shaped - shared by the onboarding wizard
// and organisation onboarding's short "Add affiliate" form.
import { AFFILIATE_FEED_DOMAINS } from '@/components/connectors/connectorConstants';
import type { Affiliate, FeedMode } from '@/engine/types';

export interface NewAffiliateProfile {
  code: string;
  name: string;
  country: string;
  region?: string;
  regulator?: string;
  legalEntityCode?: string;
  functionalCurrency?: string;
  reportingCurrency?: string;
}

/**
 * Its default manual-upload data sources (positions and general ledger
 * ) are created with it - by useSaveAffiliate (lib/hooks.ts) the first time the record is
 * saved, using defaultAffiliateSources from lib/dataSources.ts.
 */
export { defaultAffiliateSources as newAffiliateSources } from './dataSources';

/** A new affiliate in status Onboarding, with its own feeds (positions, general ledger) not yet configured. */
export function newAffiliateRecord(profile: NewAffiliateProfile, now = new Date().toISOString()): Affiliate {
  const code = profile.code.trim().toUpperCase();
  const functional = (profile.functionalCurrency ?? '').trim().toUpperCase();
  return {
    code,
    name: profile.name.trim(),
    country: profile.country.trim(),
    region: profile.region ?? '',
    regulator: profile.regulator ?? '',
    functionalCurrency: functional,
    reportingCurrency: profile.reportingCurrency ?? 'USD',
    activeCurrencies: [],
    status: 'Onboarding',
    fiscalYearEnd: '12-31',
    holidayCalendarId: null,
    legalEntityCode: profile.legalEntityCode || `LE-${code}`,
    feeds: AFFILIATE_FEED_DOMAINS.map((domain) => ({
      domain,
      mode: 'NotConfigured' as FeedMode,
      connectorId: null,
      slaDays: 30,
      owner: null,
    })),
    inheritGroupRules: true,
    internalThresholds: {},
    limitsConfirmed: false,
    createdAt: now,
  };
}

/** Basic validation for the short form: a 2-6 letter code not already taken, a name and a country. */
export function newAffiliateErrors(profile: NewAffiliateProfile, existingCodes: string[]): string[] {
  const errors: string[] = [];
  const code = profile.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(code)) errors.push('Code must be 2-6 letters or digits.');
  else if (code === 'GROUP' || existingCodes.some((c) => c.toUpperCase() === code))
    errors.push(`Code ${code} is already in use.`);
  if (!profile.name.trim()) errors.push('Name is required.');
  if (!profile.country.trim()) errors.push('Country is required.');
  return errors;
}
