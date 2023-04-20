import { methodUrl } from '@votingworks/grout';

// Importing all of @votingworks/auth causes Cypress tests to fail since @votingworks/auth contains
// code that isn't browser-safe
// eslint-disable-next-line vx/no-import-workspace-subfolders
import {
  DEV_JURISDICTION,
  mockCard,
  MockFileContents,
} from '@votingworks/auth/src/cypress';

const PIN = '000000';

function mockCardCypress(mockFileContents: MockFileContents): void {
  mockCard(mockFileContents, cy.writeFile);
}

export function mockSystemAdministratorCardInsertion(): void {
  mockCardCypress({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: {
          role: 'system_administrator',
          jurisdiction: DEV_JURISDICTION,
        },
      },
    },
    pin: PIN,
  });
}

export function mockElectionManagerCardInsertion({
  electionData,
  electionHash,
}: {
  electionData: string;
  electionHash: string;
}): void {
  mockCardCypress({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: {
          role: 'election_manager',
          jurisdiction: DEV_JURISDICTION,
          electionHash,
        },
      },
    },
    data: Buffer.from(electionData, 'utf-8'),
    pin: PIN,
  });
}

export function enterPin(): void {
  cy.contains('Enter the card PIN to unlock.');
  for (const digit of PIN) {
    cy.get(`button:contains(${digit})`).click();
  }
}

export function mockCardRemoval(): void {
  mockCardCypress({
    cardStatus: {
      status: 'no_card',
    },
  });
}

export function logOut(): void {
  cy.request('POST', methodUrl('logOut', 'http://localhost:3000/api'), {});
}
