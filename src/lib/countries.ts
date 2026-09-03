/**
 * Ecobank's actual operating footprint, grouped into the regions the business already
 * organises itself by. Onboarding picks a country from this fixed list rather than free text,
 * and the region follows the country - a region is a grouping of countries, not itself a country.
 */
export interface Country {
  code: string;
  name: string;
  region: string;
}

// "West Africa" sits alongside the Anglophone/UEMOA split for a case that doesn't fit either
// cleanly - no country in COUNTRIES auto-fills to it, so it's only ever reached by hand.
export const REGIONS = ['West Africa', 'Anglophone West Africa', 'UEMOA', 'Central Africa', 'East Africa', 'Southern Africa'] as const;

export const COUNTRIES: Country[] = [
  { code: 'NG', name: 'Nigeria', region: 'Anglophone West Africa' },
  { code: 'GH', name: 'Ghana', region: 'Anglophone West Africa' },
  { code: 'SL', name: 'Sierra Leone', region: 'Anglophone West Africa' },
  { code: 'LR', name: 'Liberia', region: 'Anglophone West Africa' },
  { code: 'GM', name: 'The Gambia', region: 'Anglophone West Africa' },
  { code: 'CI', name: "Côte d'Ivoire", region: 'UEMOA' },
  { code: 'SN', name: 'Senegal', region: 'UEMOA' },
  { code: 'BF', name: 'Burkina Faso', region: 'UEMOA' },
  { code: 'ML', name: 'Mali', region: 'UEMOA' },
  { code: 'NE', name: 'Niger', region: 'UEMOA' },
  { code: 'TG', name: 'Togo', region: 'UEMOA' },
  { code: 'BJ', name: 'Benin', region: 'UEMOA' },
  { code: 'GW', name: 'Guinea-Bissau', region: 'UEMOA' },
  { code: 'GN', name: 'Guinea', region: 'UEMOA' },
  { code: 'CM', name: 'Cameroon', region: 'Central Africa' },
  { code: 'TD', name: 'Chad', region: 'Central Africa' },
  { code: 'CF', name: 'Central African Republic', region: 'Central Africa' },
  { code: 'CG', name: 'Congo (Brazzaville)', region: 'Central Africa' },
  { code: 'CD', name: 'Congo (DRC)', region: 'Central Africa' },
  { code: 'GQ', name: 'Equatorial Guinea', region: 'Central Africa' },
  { code: 'GA', name: 'Gabon', region: 'Central Africa' },
  { code: 'ST', name: 'São Tomé and Príncipe', region: 'Central Africa' },
  { code: 'KE', name: 'Kenya', region: 'East Africa' },
  { code: 'TZ', name: 'Tanzania', region: 'East Africa' },
  { code: 'UG', name: 'Uganda', region: 'East Africa' },
  { code: 'RW', name: 'Rwanda', region: 'East Africa' },
  { code: 'BI', name: 'Burundi', region: 'East Africa' },
  { code: 'SS', name: 'South Sudan', region: 'East Africa' },
  { code: 'ZM', name: 'Zambia', region: 'Southern Africa' },
  { code: 'ZW', name: 'Zimbabwe', region: 'Southern Africa' },
  { code: 'MW', name: 'Malawi', region: 'Southern Africa' },
  { code: 'MZ', name: 'Mozambique', region: 'Southern Africa' },
];
