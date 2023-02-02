const PIN = '000000';

export function mockSystemAdministratorCardInsertion(): void {
  cy.request('PUT', 'http://localhost:3001/mock', {
    enabled: true,
    shortValue: JSON.stringify({
      t: 'system_administrator',
      p: PIN,
    }),
  });
}

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

export function enterPin(): void {
  cy.contains('Enter the card security code to unlock.');
  for (const digit of PIN) {
    cy.get(`button:contains(${digit})`).click();
  }
}

export function mockCardRemoval(): void {
  cy.request('PUT', 'http://localhost:3001/mock', {
    enabled: true,
    hasCard: false,
  });
}

export function logOut(): void {
  cy.request('POST', 'http://localhost:3000/api/logOut', {});
}
