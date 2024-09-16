import { assert } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import makeDebug from 'debug';
import { openssl } from '../cryptography';
import { CommonAccessCardDetails } from './common_access_card_api';

const debug = makeDebug('auth: cac:certs');

/**
 * Parts of a Common Access Card's CN field.
 */
export interface CommonAccessCardCommonNameParts {
  givenName: string;
  middleName?: string;
  familyName: string;
  commonAccessCardId: string;
}

/**
 * Constructs a CAC card cert subject that can be
 * passed to an openssl command
 *
 * commonName should be in the form AIKINS.ROBERT.EDDIE.1404922102
 */
export function constructCardCertSubject(commonName: string): string {
  const entries = [
    'C=US',
    'O=U.S. Government',
    'OU=DoD',
    'OU=PKI',
    'OU=USA',
    `CN=${commonName}`,
  ];
  const certSubject = `/${entries.join('/')}/`;
  return certSubject;
}

/**
 * Parses the fields from a Common Access Card cert. For example:
 *
 * ```js
 * {
 *   C: 'US',
 *   O: 'U.S. Government',
 *   OU: 'USA',
 *   CN: 'AIKINS.ROBERT.EDDIE.1404922102'
 * }
 * ```
 *
 * Should be parsed into:
 *
 * ```js
 * {
 *   id: '1404922102',
 *   givenName: 'ROBERT',
 *   familyName: 'AIKINS',
 *   middleName: 'EDDIE',
 *   jurisdiction: 'USA'
 * }
 */
export function parseCommonAccessCardFields(certFields: {
  [fieldName: string]: string;
}): {
  id: string;
  jurisdiction: string;
  givenName: string;
  middleName?: string;
  familyName: string;
} {
  const { C, O, OU, CN } = certFields;
  assert(C === 'US');
  assert(O === 'U.S. Government');
  assert(typeof OU === 'string');
  assert(typeof CN === 'string');

  const [surname, givenName, middleName, id] = CN.split('.');
  assert(
    typeof surname === 'string' &&
      typeof givenName === 'string' &&
      typeof id === 'string'
  );

  return {
    id,
    jurisdiction: OU,
    givenName,
    middleName,
    familyName: surname,
  };
}

/**
 * Parses the provided cert and returns the custom cert fields. Throws an error
 * if the cert doesn't follow DoD's cert format.
 */
export async function parseCert(
  cert: Buffer
): Promise<CommonAccessCardCommonNameParts> {
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

  const commonAccessCardInfo = parseCommonAccessCardFields(certFields);

  return {
    givenName: commonAccessCardInfo.givenName,
    middleName: commonAccessCardInfo.middleName,
    familyName: commonAccessCardInfo.familyName,
    commonAccessCardId: commonAccessCardInfo.id,
  };
}

/**
 * Parses the provided cert and returns card details. Throws an error if the cert doesn't follow
 * the DoD's cert format.
 */
export async function parseCardDetailsFromCert(
  cert: Buffer
): Promise<CommonAccessCardDetails | undefined> {
  try {
    const certDetails = await parseCert(cert);

    const { commonAccessCardId, givenName, middleName, familyName } =
      certDetails;
    return {
      commonAccessCardId,
      givenName,
      middleName,
      familyName,
    };
  } catch (error) {
    debug('error parsing CAC details from certificate: %s', error);
  }
}
