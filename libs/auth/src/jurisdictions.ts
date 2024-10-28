/**
 * The jurisdiction in all dev certs. Follows the format of a prod cert jurisdiction
 * ({state-2-letter-abbreviation}.{county-or-town}).
 */
export const DEV_JURISDICTION = 'vx.test';

/**
 * The jurisdiction in a universal vendor card's identity cert. Grants vendor access to machines
 * regardless of their jurisdiction.
 */
export const UNIVERSAL_VENDOR_CARD_JURISDICTION = '*';
