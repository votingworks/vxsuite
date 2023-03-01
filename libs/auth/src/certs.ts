import { Buffer } from 'buffer';
import { z } from 'zod';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { User } from '@votingworks/types';

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
 * Parsed custom cert fields
 */
interface CustomCertFields {
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
 * Parses the provided cert and returns the custom cert fields. Throws an error if the cert doesn't
 * follow VotingWorks's cert format.
 */
export async function parseCert(cert: Buffer): Promise<CustomCertFields> {
  const response = await openssl(['x509', '-noout', '-subject', '-in', cert]);

  const responseString = response.toString();
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
