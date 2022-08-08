const PIN = '000000';

/**
 * For some unknown reason, the election hashes computed in Cypress tests don't match those
 * computed outside of Cypress tests
 * TODO(https://github.com/votingworks/vxsuite/issues/2243): Get to the bottom of this discrepancy
 */
export const electionMultiPartyPrimaryCypressHash =
  '0e16618fc9a27ff9202a6e8a42387f7e2d0b41c44b1cf62f3c164eaadb1506d6';
export const electionWithMsEitherNeitherCypressHash =
  '6bcee1a9bac905840a4e0537559983d6c7bd0368b83ef8b098561814f4b6fe26';

/**
 * Mocks insertion of a system administrator card
 */
export function mockSystemAdministratorCardInsertion(): void {
  cy.request('PUT', 'http://localhost:3001/mock', {
    enabled: true,
    shortValue: JSON.stringify({
      t: 'system_administrator',
      p: PIN,
    }),
  });
}

/**
 * Mocks insertion of an election manager card
 */
export function mockElectionManagerCardInsertion({
  electionData,
  electionHash,
}: {
  electionData: string;
  electionHash: string;
}): void {
  cy.request('PUT', 'http://localhost:3001/mock', {
    enabled: true,
    shortValue: JSON.stringify({
      t: 'election_manager',
      h: electionHash,
      p: PIN,
    }),
    longValue: electionData,
  });
}

/**
 * Enters a card PIN
 */
export function enterPin(): void {
  for (const digit of PIN) {
    cy.get(`button:contains(${digit})`).click();
  }
}

/**
 * Mocks removal of a card
 */
export function mockCardRemoval(): void {
  cy.request('PUT', 'http://localhost:3001/mock', {
    enabled: true,
    hasCard: false,
  });
}
