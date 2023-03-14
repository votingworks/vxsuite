import { Buffer } from 'buffer';
import { z } from 'zod';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  User,
} from '@votingworks/types';

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
  /** Format: {state-2-letter-abbreviation}.{county-or-town} (e.g. MS.Warren) */
  JURISDICTION: `${VX_IANA_ENTERPRISE_OID}.2`,
  /** One of: sa, em, pw (system administrator, election manager, or poll worker) */
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
 * Parsed custom cert fields
 */
export interface CustomCertFields {
  component: 'card' | 'admin' | 'central-scan' | 'mark' | 'scan';
  jurisdiction: string;
  cardType?: 'sa' | 'em' | 'pw';
  electionHash?: string;
}

/**
 * A schema to facilitate parsing custom cert fields
 */
const CustomCertFieldsSchema: z.ZodSchema<CustomCertFields> = z.object({
  component: z.enum(['card', 'admin', 'central-scan', 'mark', 'scan']),
  jurisdiction: z.string(),
  cardType: z.optional(z.enum(['sa', 'em', 'pw'])),
  electionHash: z.optional(z.string()),
});

/**
 * Cert expiries in days
 */
export const CERT_EXPIRY_IN_DAYS = {
  DEV: 36500, // ~100 years
} as const;

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
 * Parses the provided cert and returns a user object. Throws an error if the cert doesn't follow
 * VotingWorks's card cert format or isn't for the specified jurisdiction.
 */
export async function parseUserDataFromCert(
  cert: Buffer,
  expectedJurisdiction: string
): Promise<User> {
  const { component, jurisdiction, cardType, electionHash } = await parseCert(
    cert
  );
  assert(component === 'card');
  assert(jurisdiction === expectedJurisdiction);
  assert(cardType !== undefined);

  switch (cardType) {
    case 'sa': {
      return { role: 'system_administrator' };
    }
    case 'em': {
      assert(electionHash !== undefined);
      return { role: 'election_manager', electionHash };
    }
    case 'pw': {
      assert(electionHash !== undefined);
      return { role: 'poll_worker', electionHash };
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
export function constructCardCertSubject(
  user: SystemAdministratorUser | ElectionManagerUser | PollWorkerUser,
  jurisdiction: string
): string {
  const component: CustomCertFields['component'] = 'card';

  let cardType: CustomCertFields['cardType'];
  let electionHash: string | undefined;
  switch (user.role) {
    case 'system_administrator': {
      cardType = 'sa';
      break;
    }
    case 'election_manager': {
      cardType = 'em';
      electionHash = user.electionHash;
      break;
    }
    case 'poll_worker': {
      cardType = 'pw';
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
