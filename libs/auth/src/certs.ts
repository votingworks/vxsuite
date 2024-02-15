import { Buffer } from 'buffer';
import { z } from 'zod';
import { assert, throwIllegalValue } from '@votingworks/basics';

import { arePollWorkerCardDetails, CardDetails } from './card';
import { openssl } from './cryptography';

/**
 * VotingWorks's IANA-assigned enterprise OID
 */
const VX_IANA_ENTERPRISE_OID = '1.3.6.1.4.1.59817';

/**
 * Instead of overloading existing X.509 cert fields, we're using our own custom cert fields.
 */
const VX_CUSTOM_CERT_FIELD = {
  /**
   * One of: admin, central-scan, mark, mark-scan, scan, card (the first five referring to
   * machines)
   */
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

interface VxAdminCustomCertFields {
  component: 'admin';
  jurisdiction: string;
}

interface VxCentralScanCustomCertFields {
  component: 'central-scan';
}

interface VxMarkCustomCertFields {
  component: 'mark';
}

interface VxMarkScanCustomCertFields {
  component: 'mark-scan';
}

interface VxScanCustomCertFields {
  component: 'scan';
}

interface SystemAdministratorCardCustomCertFields {
  component: 'card';
  jurisdiction: string;
  cardType: 'system-administrator';
}

interface ElectionCardCustomCertFields {
  component: 'card';
  jurisdiction: string;
  cardType: 'election-manager' | 'poll-worker' | 'poll-worker-with-pin';
  electionHash: string;
}

type CardCustomCertFields =
  | SystemAdministratorCardCustomCertFields
  | ElectionCardCustomCertFields;

/**
 * Parsed custom cert fields
 */
export type CustomCertFields =
  | VxAdminCustomCertFields
  | VxCentralScanCustomCertFields
  | VxMarkCustomCertFields
  | VxMarkScanCustomCertFields
  | VxScanCustomCertFields
  | CardCustomCertFields;

/**
 * Valid values for component field in VotingWorks certs
 */
export type Component = CustomCertFields['component'];

/**
 * Machine type as specified in VotingWorks certs
 */
export type MachineType = Exclude<Component, 'card'>;

/**
 * Valid values for card type field in VotingWorks certs
 */
export type CardType = CardCustomCertFields['cardType'];

const VxAdminCustomCertFieldsSchema: z.ZodSchema<VxAdminCustomCertFields> =
  z.object({
    component: z.literal('admin'),
    jurisdiction: z.string(),
  });

const VxCentralScanCustomCertFieldsSchema: z.ZodSchema<VxCentralScanCustomCertFields> =
  z.object({
    component: z.literal('central-scan'),
  });

const VxMarkCustomCertFieldsSchema: z.ZodSchema<VxMarkCustomCertFields> =
  z.object({
    component: z.literal('mark'),
  });

const VxMarkScanCustomCertFieldsSchema: z.ZodSchema<VxMarkScanCustomCertFields> =
  z.object({
    component: z.literal('mark-scan'),
  });

const VxScanCustomCertFieldsSchema: z.ZodSchema<VxScanCustomCertFields> =
  z.object({
    component: z.literal('scan'),
  });

const SystemAdministratorCardCustomCertFieldsSchema: z.ZodSchema<SystemAdministratorCardCustomCertFields> =
  z.object({
    component: z.literal('card'),
    jurisdiction: z.string(),
    cardType: z.literal('system-administrator'),
  });

const ElectionCardCustomCertFieldsSchema: z.ZodSchema<ElectionCardCustomCertFields> =
  z.object({
    component: z.literal('card'),
    jurisdiction: z.string(),
    cardType: z.union([
      z.literal('election-manager'),
      z.literal('poll-worker'),
      z.literal('poll-worker-with-pin'),
    ]),
    electionHash: z.string(),
  });

const CardCustomCertFieldsSchema: z.ZodSchema<CardCustomCertFields> = z.union([
  SystemAdministratorCardCustomCertFieldsSchema,
  ElectionCardCustomCertFieldsSchema,
]);

/**
 * A schema to facilitate parsing custom cert fields
 */
const CustomCertFieldsSchema: z.ZodSchema<CustomCertFields> = z.union([
  VxAdminCustomCertFieldsSchema,
  VxCentralScanCustomCertFieldsSchema,
  VxMarkCustomCertFieldsSchema,
  VxMarkScanCustomCertFieldsSchema,
  VxScanCustomCertFieldsSchema,
  CardCustomCertFieldsSchema,
]);

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

  const certDetails = CustomCertFieldsSchema.parse({
    component: certFields[VX_CUSTOM_CERT_FIELD.COMPONENT],
    jurisdiction: certFields[VX_CUSTOM_CERT_FIELD.JURISDICTION],
    cardType: certFields[VX_CUSTOM_CERT_FIELD.CARD_TYPE],
    electionHash: certFields[VX_CUSTOM_CERT_FIELD.ELECTION_HASH],
  });

  return certDetails;
}

/**
 * Parses the provided cert and returns card details. Throws an error if the cert doesn't follow
 * VotingWorks's card cert format.
 */
export async function parseCardDetailsFromCert(
  cert: Buffer
): Promise<CardDetails> {
  const certDetails = await parseCert(cert);
  assert(certDetails.component === 'card');
  const { jurisdiction, cardType } = certDetails;

  switch (cardType) {
    case 'system-administrator': {
      return {
        user: { role: 'system_administrator', jurisdiction },
      };
    }
    case 'election-manager': {
      const { electionHash } = certDetails;
      return {
        user: { role: 'election_manager', jurisdiction, electionHash },
      };
    }
    case 'poll-worker': {
      const { electionHash } = certDetails;
      return {
        user: { role: 'poll_worker', jurisdiction, electionHash },
        hasPin: false,
      };
    }
    case 'poll-worker-with-pin': {
      const { electionHash } = certDetails;
      return {
        user: { role: 'poll_worker', jurisdiction, electionHash },
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
  const { user } = cardDetails;
  const component: Component = 'card';

  let cardType: CardType;
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
    `${VX_CUSTOM_CERT_FIELD.JURISDICTION}=${user.jurisdiction}`,
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
  const component: Component = 'card';
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
  machineType: MachineType,
  jurisdiction?: string
): string {
  assert(
    (machineType === 'admin' && jurisdiction !== undefined) ||
      (machineType !== 'admin' && jurisdiction === undefined)
  );
  const entries = [
    ...STANDARD_CERT_FIELDS,
    `${VX_CUSTOM_CERT_FIELD.COMPONENT}=${machineType}`,
  ];
  if (jurisdiction) {
    entries.push(`${VX_CUSTOM_CERT_FIELD.JURISDICTION}=${jurisdiction}`);
  }
  const certSubject = `/${entries.join('/')}/`;
  return certSubject;
}
