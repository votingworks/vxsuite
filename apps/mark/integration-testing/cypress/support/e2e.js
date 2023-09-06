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
import { TEST_JURISDICTION } from '@votingworks/types';

// Importing all of @votingworks/auth causes Cypress tests to fail since @votingworks/auth contains
// code that isn't browser-safe
// eslint-disable-next-line vx/no-import-workspace-subfolders
import { mockCard } from '@votingworks/auth/src/cypress';

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
        user: {
          role: 'election_manager',
          jurisdiction: TEST_JURISDICTION,
          electionHash,
        },
      },
    },
    pin: PIN,
  });
}

function insertPollWorkerCard() {
  mockCardCypress({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: {
          role: 'poll_worker',
          jurisdiction: TEST_JURISDICTION,
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
  cy.request(
    'POST',
    methodUrl('endCardlessVoterSession', 'http://localhost:3000/api'),
    {}
  );
}

function configureWithSampleDefinitionAndSystemSettings() {
  cy.request(
    'POST',
    methodUrl(
      'configureWithSampleBallotPackageForIntegrationTest',
      'http://localhost:3000/api'
    ),
    {}
  );
}

beforeEach(() => {
  endCardlessVoterSession();
  configureWithSampleDefinitionAndSystemSettings();

  insertElectionManagerCard();
  cy.visit('/');

  // Authenticate
  for (const digit of PIN) {
    cy.contains(digit).click();
  }

  cy.get('#selectPrecinct').select('All Precincts');
  removeCard();

  // Back at the home screen
  cy.contains('Insert Poll Worker card to open');

  // Open polls
  insertPollWorkerCard();
  cy.contains('Open Polls').click();
  cy.get('[data-testid="modal"]').contains('button', 'Open Polls').click();

  // Activate ballot
  cy.contains('Center Springfield').click();
  cy.contains('12').click();
  removeCard();
});
