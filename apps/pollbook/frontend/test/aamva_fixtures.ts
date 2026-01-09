import {
  AamvaDocument,
  VoterSearchParams,
} from '@votingworks/pollbook-backend';

const mockAamvaDocument: AamvaDocument = {
  firstName: 'Aaron',
  middleName: 'Danger',
  lastName: 'Burr',
  nameSuffix: 'Jr',
  issuingJurisdiction: 'NH',
};

const mockExactSearchParams: VoterSearchParams = {
  firstName: mockAamvaDocument.firstName,
  middleName: mockAamvaDocument.middleName,
  lastName: mockAamvaDocument.lastName,
  suffix: mockAamvaDocument.nameSuffix,
  strictMatch: true,
};

export function getMockAamvaDocument(
  overrides: Partial<AamvaDocument> = {}
): AamvaDocument {
  return { ...mockAamvaDocument, ...overrides };
}

/*
 * Returns {@link VoterSearchParams} that require an exact match to mimic voter search behavior for scanned IDs.
 * Search param name values default to those of the AAMVA document returned by {@link getMockAamvaDocument}.
 */
export function getMockExactSearchParams(
  overrides: Partial<VoterSearchParams> = {}
): VoterSearchParams {
  return {
    ...mockExactSearchParams,
    ...overrides,
  };
}
