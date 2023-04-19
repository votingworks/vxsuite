/**
 * These are here mainly so `configuration.cy.ts` can import them in a browser
 * environment by importing this file directly. That way we don't have to
 * import packages that don't work in the browser.
 */
import { z } from 'zod';
import { CustomCertFields } from './types';

/**
 * VotingWorks's IANA-assigned enterprise OID
 */
const VX_IANA_ENTERPRISE_OID = '1.3.6.1.4.1.59817';

/**
 * Instead of overloading existing X.509 cert fields, we're using our own custom cert fields.
 */
export const VX_CUSTOM_CERT_FIELD = {
  /** One of: card, admin, central-scan, mark, scan (the latter four referring to machines) */
  COMPONENT: `${VX_IANA_ENTERPRISE_OID}.1`,
  /** Format: {state-2-letter-abbreviation}.{county-or-town} (e.g. ms.warren or ca.los-angeles) */
  JURISDICTION: `${VX_IANA_ENTERPRISE_OID}.2`,
  /** One of: system-administrator, election-manager, poll-worker, poll-worker-with-pin */
  CARD_TYPE: `${VX_IANA_ENTERPRISE_OID}.3`,
  /** The SHA-256 hash of the election definition  */
  ELECTION_HASH: `${VX_IANA_ENTERPRISE_OID}.4`,
} as const;

/**
 * Standard X.509 cert fields, common across all VotingWorks certs
 */
export const STANDARD_CERT_FIELDS = [
  'C=US', // Country
  'ST=CA', // State
  'O=VotingWorks', // Organization
] as const;

/**
 * A schema to facilitate parsing custom cert fields
 */
export const CustomCertFieldsSchema: z.ZodSchema<CustomCertFields> = z.object({
  component: z.enum(['card', 'admin', 'central-scan', 'mark', 'scan']),
  jurisdiction: z.string(),
  cardType: z.optional(
    z.enum([
      'system-administrator',
      'election-manager',
      'poll-worker',
      'poll-worker-with-pin',
    ])
  ),
  electionHash: z.optional(z.string()),
});

/**
 * Cert expiries in days. Must be integers.
 */
export const CERT_EXPIRY_IN_DAYS = {
  CARD_VX_CERT: 365 * 100, // 100 years
  SYSTEM_ADMINISTRATOR_CARD_VX_ADMIN_CERT: 365 * 5, // 5 years
  ELECTION_CARD_VX_ADMIN_CERT: Math.round(365 * 0.5), // 6 months

  /** Used by dev/test cert-generation scripts */
  DEV: 365 * 100, // 100 years
} as const;

/**
 * The jurisdiction in all dev certs
 */
export const DEV_JURISDICTION = 'st.dev-jurisdiction';
