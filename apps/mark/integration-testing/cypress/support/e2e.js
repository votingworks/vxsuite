// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

import '@testing-library/cypress/add-commands';
import './commands';

import { electionSampleDefinition } from '@votingworks/fixtures';
import { methodUrl } from '@votingworks/grout';

// Importing all of @votingworks/auth causes Cypress tests to fail since Cypress doesn't seem to
// interact well with PCSC Lite card reader code
// eslint-disable-next-line vx/no-import-workspace-subfolders
import { mockCard } from '@votingworks/auth/src/mock_file_card';

const JURISDICTION = 'st.jurisdiction';
const { electionData, electionHash } = electionSampleDefinition;
const PIN = '000000';

function mockCardCypress(mockFileContents) {
  mockCard(mockFileContents, cy.writeFile);
}

function insertElectionManagerCard() {
  mockCardCypress({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        jurisdiction: JURISDICTION,
        user: {
          role: 'election_manager',
          electionHash,
        },
      },
    },
    data: Buffer.from(electionData, 'utf-8'),
    pin: PIN,
  });
}

function insertPollWorkerCard() {
  mockCardCypress({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        jurisdiction: JURISDICTION,
        user: {
          role: 'poll_worker',
          electionHash,
        },
        hasPin: false,
      },
    },
  });
}

function removeCard() {
  mockCardCypress({
    cardStatus: {
      status: 'no_card',
    },
  });
}

function endCardlessVoterSession() {
  cy.request('POST', methodUrl('endCardlessVoterSession', 'http://localhost:3000/api'), {});
}

beforeEach(() => {
  endCardlessVoterSession();

  insertElectionManagerCard();
  cy.visit('/');

  // Authenticate
  for (const digit of PIN) {
    cy.contains(digit).click();
  }

  // Load election
  cy.contains('Load Election Definition').click();
  cy.get('#selectPrecinct').select('All Precincts');
  removeCard();

  // Back at the home screen
  cy.contains('Insert Poll Worker card to open');

  // Open polls
  insertPollWorkerCard();
  cy.contains('Open Polls').click();
  cy.contains('Open Polls on VxMark Now').click();

  // Activate ballot
  cy.contains('Center Springfield').click();
  cy.contains('12').click();
  removeCard();
});
