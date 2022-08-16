const PIN = '000000';

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
