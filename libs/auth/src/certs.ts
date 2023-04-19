import { Buffer } from 'buffer';
import { assert, throwIllegalValue } from '@votingworks/basics';

import { arePollWorkerCardDetails, CardDetails } from './card';
import { openssl } from './openssl';
import {
  CustomCertFieldsSchema,
  STANDARD_CERT_FIELDS,
  VX_CUSTOM_CERT_FIELD,
} from './constants';
import { CustomCertFields } from './types';

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
        user: { role: 'system_administrator', jurisdiction },
      };
    }
    case 'election-manager': {
      assert(electionHash !== undefined);
      return {
        user: { role: 'election_manager', jurisdiction, electionHash },
      };
    }
    case 'poll-worker': {
      assert(electionHash !== undefined);
      return {
        user: { role: 'poll_worker', jurisdiction, electionHash },
        hasPin: false,
      };
    }
    case 'poll-worker-with-pin': {
      assert(electionHash !== undefined);
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
