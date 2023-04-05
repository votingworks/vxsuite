import { Buffer } from 'buffer';
import { z } from 'zod';
import { assert, throwIllegalValue } from '@votingworks/basics';

import { arePollWorkerCardDetails, CardDetails } from './card';
import { openssl } from './openssl';

/**
 * VotingWorks's IANA-assigned enterprise OID
 */
const VX_IANA_ENTERPRISE_OID = '1.3.6.1.4.1.59817';

/**
 * Instead of overloading existing X.509 cert fields, we're using our own custom cert fields.
 */
const VX_CUSTOM_CERT_FIELD = {
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
 * Valid values for cert card type field
 */
export type CardType =
  | 'system-administrator'
  | 'election-manager'
  | 'poll-worker'
  | 'poll-worker-with-pin';

/**
 * Parsed custom cert fields
 */
export interface CustomCertFields {
  component: 'card' | 'admin' | 'central-scan' | 'mark' | 'scan';
  jurisdiction: string;
  cardType?: CardType;
  electionHash?: string;
}

/**
 * A schema to facilitate parsing custom cert fields
 */
const CustomCertFieldsSchema: z.ZodSchema<CustomCertFields> = z.object({
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

/**
 * Parses the provided cert and returns the custom cert fields. Throws an error if the cert doesn't
 * follow VotingWorks's cert format.
 */
export async function parseCert(cert: Buffer): Promise<CustomCertFields> {
  const response = await openssl(['x509', '-noout', '-subject', '-in', cert]);

  const responseString = response.toString('utf-8');
  assert(responseString.startsWith('subject='));
  const certSubject = responseString.replace('subject=', '').trimEnd();

  const certFieldsList = certSubject
    .split(',')
    .map((field) => field.trimStart());
  const certFields: { [fieldName: string]: string } = {};
  for (const certField of certFieldsList) {
    const [fieldName, fieldValue] = certField.split(' = ');
    if (fieldName && fieldValue) {
      certFields[fieldName] = fieldValue;
    }
  }

  const customCertFields = CustomCertFieldsSchema.parse({
    component: certFields[VX_CUSTOM_CERT_FIELD.COMPONENT],
    jurisdiction: certFields[VX_CUSTOM_CERT_FIELD.JURISDICTION],
    cardType: certFields[VX_CUSTOM_CERT_FIELD.CARD_TYPE],
    electionHash: certFields[VX_CUSTOM_CERT_FIELD.ELECTION_HASH],
  });

  return customCertFields;
}

/**
 * Parses the provided cert and returns card details. Throws an error if the cert doesn't follow
 * VotingWorks's card cert format.
 */
export async function parseCardDetailsFromCert(
  cert: Buffer
): Promise<CardDetails> {
  const { component, jurisdiction, cardType, electionHash } = await parseCert(
    cert
  );
  assert(component === 'card');
  assert(cardType !== undefined);

  switch (cardType) {
    case 'system-administrator': {
      return {
        jurisdiction,
        user: { role: 'system_administrator' },
      };
    }
    case 'election-manager': {
      assert(electionHash !== undefined);
      return {
        jurisdiction,
        user: { role: 'election_manager', electionHash },
      };
    }
    case 'poll-worker': {
      assert(electionHash !== undefined);
      return {
        jurisdiction,
        user: { role: 'poll_worker', electionHash },
        hasPin: false,
      };
    }
    case 'poll-worker-with-pin': {
      assert(electionHash !== undefined);
      return {
        jurisdiction,
        user: { role: 'poll_worker', electionHash },
        hasPin: true,
      };
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(cardType);
    }
  }
}

/**
 * Constructs a VotingWorks card cert subject that can be passed to an openssl command
 */
export function constructCardCertSubject(cardDetails: CardDetails): string {
  const { jurisdiction, user } = cardDetails;
  const component: CustomCertFields['component'] = 'card';

  let cardType: CustomCertFields['cardType'];
  let electionHash: string | undefined;
  switch (user.role) {
    case 'system_administrator': {
      cardType = 'system-administrator';
      break;
    }
    case 'election_manager': {
      cardType = 'election-manager';
      electionHash = user.electionHash;
      break;
    }
    case 'poll_worker': {
      assert(arePollWorkerCardDetails(cardDetails));
      cardType = cardDetails.hasPin ? 'poll-worker-with-pin' : 'poll-worker';
      electionHash = user.electionHash;
      break;
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(user, 'role');
    }
  }

  const entries = [
    ...STANDARD_CERT_FIELDS,
    `${VX_CUSTOM_CERT_FIELD.COMPONENT}=${component}`,
    `${VX_CUSTOM_CERT_FIELD.JURISDICTION}=${jurisdiction}`,
    `${VX_CUSTOM_CERT_FIELD.CARD_TYPE}=${cardType}`,
  ];
  if (electionHash) {
    entries.push(`${VX_CUSTOM_CERT_FIELD.ELECTION_HASH}=${electionHash}`);
  }
  const certSubject = `/${entries.join('/')}/`;

  return certSubject;
}

/**
 * Constructs a VotingWorks card cert subject without a jurisdiction and card type, that can be
 * passed to an openssl command. This trimmed down cert subject is used in the card's
 * VotingWorks-issued cert. The card's VxAdmin-issued cert, on the other hand, requires
 * jurisdiction and card type.
 */
export function constructCardCertSubjectWithoutJurisdictionAndCardType(): string {
  const component: CustomCertFields['component'] = 'card';
  const entries = [
    ...STANDARD_CERT_FIELDS,
    `${VX_CUSTOM_CERT_FIELD.COMPONENT}=${component}`,
  ];
  const certSubject = `/${entries.join('/')}/`;
  return certSubject;
}

/**
 * Constructs a VotingWorks machine cert subject that can be passed to an openssl command
 */
export function constructMachineCertSubject(
  component: Exclude<CustomCertFields['component'], 'card'>,
  jurisdiction: string
): string {
  const entries = [
    ...STANDARD_CERT_FIELDS,
    `${VX_CUSTOM_CERT_FIELD.COMPONENT}=${component}`,
    `${VX_CUSTOM_CERT_FIELD.JURISDICTION}=${jurisdiction}`,
  ];
  const certSubject = `/${entries.join('/')}/`;
  return certSubject;
}
