import { Buffer } from 'node:buffer';
import { z } from 'zod/v4';
import {
  assert,
  DateWithoutTime,
  throwIllegalValue,
} from '@votingworks/basics';
import { ElectionKey } from '@votingworks/types';

import { arePollWorkerCardDetails, ProgrammedCardDetails } from './card';
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
   * One of: admin, central-scan, mark, mark-scan, poll-book, scan, card (the first six referring
   * to machines)
   */
  COMPONENT: `${VX_IANA_ENTERPRISE_OID}.1`,
  /** Format: {state-2-letter-abbreviation}.{county-or-town} (e.g. ms.warren or ca.los-angeles) */
  JURISDICTION: `${VX_IANA_ENTERPRISE_OID}.2`,
  /** One of: vendor, system-administrator, election-manager, poll-worker, poll-worker-with-pin */
  CARD_TYPE: `${VX_IANA_ENTERPRISE_OID}.3`,
  /** The election ID from the {@link ElectionKey}, only relevant for election card certs */
  ELECTION_ID: `${VX_IANA_ENTERPRISE_OID}.4`,
  /** The election date from the {@link ElectionKey}, only relevant for election card certs */
  ELECTION_DATE: `${VX_IANA_ENTERPRISE_OID}.5`,
  /** The machine ID, only relevant for machine certs */
  MACHINE_ID: `${VX_IANA_ENTERPRISE_OID}.6`,
} as const;

/**
 * Standard X.509 cert fields, common across all VotingWorks certs
 */
export const STANDARD_CERT_FIELDS = [
  'C=US', // Country
  'ST=CA', // State
  'O=VotingWorks', // Organization
] as const;

interface BaseMachineCustomCertFields {
  machineId: string;
}

interface VxAdminCustomCertFields extends BaseMachineCustomCertFields {
  component: 'admin';
  jurisdiction: string;
}

interface VxCentralScanCustomCertFields extends BaseMachineCustomCertFields {
  component: 'central-scan';
}

interface VxMarkCustomCertFields extends BaseMachineCustomCertFields {
  component: 'mark';
}

interface VxMarkScanCustomCertFields extends BaseMachineCustomCertFields {
  component: 'mark-scan';
}

interface VxScanCustomCertFields extends BaseMachineCustomCertFields {
  component: 'scan';
}

interface VxPollBookCustomCertFields extends BaseMachineCustomCertFields {
  component: 'poll-book';
  jurisdiction: string;
}

interface BaseCardCustomCertFields {
  component: 'card';
  jurisdiction: string;
}

interface VendorCardCustomCertFields extends BaseCardCustomCertFields {
  cardType: 'vendor';
}

interface SystemAdministratorCardCustomCertFields
  extends BaseCardCustomCertFields {
  cardType: 'system-administrator';
}

interface ElectionCardCustomCertFields extends BaseCardCustomCertFields {
  cardType: 'election-manager' | 'poll-worker' | 'poll-worker-with-pin';
  electionId: string;
  electionDate: string;
}

/**
 * Parsed custom cert fields for a card cert
 */
export type CardCustomCertFields =
  | VendorCardCustomCertFields
  | SystemAdministratorCardCustomCertFields
  | ElectionCardCustomCertFields;

/**
 * Parsed custom cert fields for a machine cert
 */
export type MachineCustomCertFields =
  | VxAdminCustomCertFields
  | VxCentralScanCustomCertFields
  | VxMarkCustomCertFields
  | VxMarkScanCustomCertFields
  | VxScanCustomCertFields
  | VxPollBookCustomCertFields;

/**
 * Parsed custom cert fields
 */
export type CustomCertFields = CardCustomCertFields | MachineCustomCertFields;

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

/**
 * Machine details as extracted from a VotingWorks machine cert
 */
export interface MachineDetails {
  machineType: MachineType;
  machineId: string;
  jurisdiction?: string;
}

const VxAdminCustomCertFieldsSchema: z.ZodSchema<VxAdminCustomCertFields> =
  z.strictObject({
    component: z.literal('admin'),
    machineId: z.string(),
    jurisdiction: z.string(),
  });

const VxCentralScanCustomCertFieldsSchema: z.ZodSchema<VxCentralScanCustomCertFields> =
  z.strictObject({
    component: z.literal('central-scan'),
    machineId: z.string(),
  });

const VxMarkCustomCertFieldsSchema: z.ZodSchema<VxMarkCustomCertFields> =
  z.strictObject({
    component: z.literal('mark'),
    machineId: z.string(),
  });

const VxMarkScanCustomCertFieldsSchema: z.ZodSchema<VxMarkScanCustomCertFields> =
  z.strictObject({
    component: z.literal('mark-scan'),
    machineId: z.string(),
  });

const VxScanCustomCertFieldsSchema: z.ZodSchema<VxScanCustomCertFields> =
  z.strictObject({
    component: z.literal('scan'),
    machineId: z.string(),
  });

const VxPollBookCustomCertFieldsSchema: z.ZodSchema<VxPollBookCustomCertFields> =
  z.strictObject({
    component: z.literal('poll-book'),
    machineId: z.string(),
    jurisdiction: z.string(),
  });

const VendorCardCustomCertFieldsSchema: z.ZodSchema<VendorCardCustomCertFields> =
  z.strictObject({
    component: z.literal('card'),
    jurisdiction: z.string(),
    cardType: z.literal('vendor'),
  });

const SystemAdministratorCardCustomCertFieldsSchema: z.ZodSchema<SystemAdministratorCardCustomCertFields> =
  z.strictObject({
    component: z.literal('card'),
    jurisdiction: z.string(),
    cardType: z.literal('system-administrator'),
  });

const ElectionCardCustomCertFieldsSchema: z.ZodSchema<ElectionCardCustomCertFields> =
  z.strictObject({
    component: z.literal('card'),
    jurisdiction: z.string(),
    cardType: z.union([
      z.literal('election-manager'),
      z.literal('poll-worker'),
      z.literal('poll-worker-with-pin'),
    ]),
    electionId: z.string(),
    electionDate: z.string(),
  });

const CardCustomCertFieldsSchema: z.ZodSchema<CardCustomCertFields> = z.union([
  VendorCardCustomCertFieldsSchema,
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
  VxPollBookCustomCertFieldsSchema,
  CardCustomCertFieldsSchema,
]);

/**
 * Cert expiries in days. Must be integers.
 */
export const CERT_EXPIRY_IN_DAYS = {
  ROOT_CERT_AUTHORITY_CERT: 365 * 100, // 100 years
  MACHINE_VX_CERT: 365 * 100, // 100 years
  CARD_VX_CERT: 365 * 100, // 100 years
  VENDOR_CARD_IDENTITY_CERT: 60, // 2 months
  SYSTEM_ADMINISTRATOR_CARD_IDENTITY_CERT: 365 * 5, // 5 years
  ELECTION_CARD_IDENTITY_CERT: Math.round(365 * 0.5), // 6 months

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
    assert(fieldName !== undefined, 'Malformed cert subject line');
    assert(fieldValue !== undefined, 'Malformed cert subject line');
    certFields[fieldName] = fieldValue;
  }

  const certDetails = CustomCertFieldsSchema.parse(
    // Filter out keys with undefined values before Zod parsing with schema that includes strict
    // objects, i.e., objects that don't allow unspecified keys
    Object.fromEntries(
      Object.entries({
        component: certFields[VX_CUSTOM_CERT_FIELD.COMPONENT],
        jurisdiction: certFields[VX_CUSTOM_CERT_FIELD.JURISDICTION],
        cardType: certFields[VX_CUSTOM_CERT_FIELD.CARD_TYPE],
        electionId: certFields[VX_CUSTOM_CERT_FIELD.ELECTION_ID],
        electionDate: certFields[VX_CUSTOM_CERT_FIELD.ELECTION_DATE],
        machineId: certFields[VX_CUSTOM_CERT_FIELD.MACHINE_ID],
      }).filter(([, value]) => value !== undefined)
    )
  );

  return certDetails;
}

function createElectionKey(
  certDetails: ElectionCardCustomCertFields
): ElectionKey {
  const { electionId, electionDate } = certDetails;
  return {
    id: electionId,
    date: new DateWithoutTime(electionDate),
  };
}

/**
 * Converts parsed certs into a {@link ProgrammedCardDetails} object
 */
export function certDetailsToCardDetails(
  cardIdentityCertDetails: VendorCardCustomCertFields
): ProgrammedCardDetails;

/**
 * Converts parsed certs into a {@link ProgrammedCardDetails} object
 */
export function certDetailsToCardDetails(
  cardIdentityCertDetails:
    | SystemAdministratorCardCustomCertFields
    | ElectionCardCustomCertFields,
  programmingMachineCertAuthorityCertDetails: MachineCustomCertFields
): ProgrammedCardDetails;

/**
 * Converts parsed certs into a {@link ProgrammedCardDetails} object
 */
export function certDetailsToCardDetails(
  cardIdentityCertDetails: CardCustomCertFields,
  programmingMachineCertAuthorityCertDetails?: MachineCustomCertFields
): ProgrammedCardDetails {
  const { cardType, jurisdiction } = cardIdentityCertDetails;

  if (cardType === 'vendor') {
    return {
      user: {
        role: 'vendor',
        jurisdiction,
      },
    };
  }

  assert(programmingMachineCertAuthorityCertDetails !== undefined);
  const programmingMachineType =
    programmingMachineCertAuthorityCertDetails.component;
  assert(
    programmingMachineType === 'admin' || programmingMachineType === 'poll-book'
  );

  switch (cardType) {
    case 'system-administrator': {
      return {
        user: {
          role: 'system_administrator',
          jurisdiction,
          programmingMachineType,
        },
      };
    }
    case 'election-manager': {
      return {
        user: {
          role: 'election_manager',
          jurisdiction,
          programmingMachineType,
          electionKey: createElectionKey(cardIdentityCertDetails),
        },
      };
    }
    case 'poll-worker': {
      return {
        user: {
          role: 'poll_worker',
          jurisdiction,
          programmingMachineType,
          electionKey: createElectionKey(cardIdentityCertDetails),
        },
        hasPin: false,
      };
    }
    case 'poll-worker-with-pin': {
      return {
        user: {
          role: 'poll_worker',
          jurisdiction,
          programmingMachineType,
          electionKey: createElectionKey(cardIdentityCertDetails),
        },
        hasPin: true,
      };
    }
    /* istanbul ignore next: Compile-time check for completeness - @preserve */
    default: {
      throwIllegalValue(cardIdentityCertDetails, 'cardType');
    }
  }
}

/**
 * Constructs a VotingWorks card cert subject that can be passed to an openssl command
 */
export function constructCardCertSubject(
  cardDetails: ProgrammedCardDetails
): string {
  const { user } = cardDetails;
  const component: Component = 'card';

  let cardType: CardType;
  let electionKey: ElectionKey | undefined;
  switch (user.role) {
    case 'vendor': {
      cardType = 'vendor';
      break;
    }
    case 'system_administrator': {
      cardType = 'system-administrator';
      break;
    }
    case 'election_manager': {
      cardType = 'election-manager';
      electionKey = user.electionKey;
      break;
    }
    case 'poll_worker': {
      assert(arePollWorkerCardDetails(cardDetails));
      cardType = cardDetails.hasPin ? 'poll-worker-with-pin' : 'poll-worker';
      electionKey = user.electionKey;
      break;
    }
    /* istanbul ignore next: Compile-time check for completeness - @preserve */
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
  if (electionKey) {
    entries.push(`${VX_CUSTOM_CERT_FIELD.ELECTION_ID}=${electionKey.id}`);
    entries.push(
      `${VX_CUSTOM_CERT_FIELD.ELECTION_DATE}=${electionKey.date.toISOString()}`
    );
  }
  const certSubject = `/${entries.join('/')}/`;

  return certSubject;
}

/**
 * Constructs a VotingWorks card cert subject without a jurisdiction and card type, that can be
 * passed to an openssl command. This trimmed down cert subject is used in the card's
 * VotingWorks-issued cert. The card's VxAdmin/VxPollBook-issued cert, on the other hand, requires
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
export function constructMachineCertSubject({
  machineType,
  machineId,
  jurisdiction,
}: MachineDetails): string {
  if (machineType === 'admin' || machineType === 'poll-book') {
    assert(jurisdiction !== undefined);
  } else {
    assert(jurisdiction === undefined);
  }
  const entries = [
    ...STANDARD_CERT_FIELDS,
    `${VX_CUSTOM_CERT_FIELD.COMPONENT}=${machineType}`,
    `${VX_CUSTOM_CERT_FIELD.MACHINE_ID}=${machineId}`,
  ];
  if (jurisdiction) {
    entries.push(`${VX_CUSTOM_CERT_FIELD.JURISDICTION}=${jurisdiction}`);
  }
  const certSubject = `/${entries.join('/')}/`;
  return certSubject;
}
