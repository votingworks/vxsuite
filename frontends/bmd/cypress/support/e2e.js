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
import { makeElectionManagerCard, makePollWorkerCard } from '@votingworks/test-utils';
import { CardData } from '@votingworks/types';

const ELECTION_MANAGER_CARD_DATA = makeElectionManagerCard(
  electionSampleDefinition.electionHash,
  '000000'
);
const POLL_WORKER_CARD_DATA = makePollWorkerCard(
  electionSampleDefinition.electionHash
);

/**
 * 
 * @param {CardData} card
 * @param {string=} longValue 
 * @returns {void}
 */
function insertCard(card, longValue) {
  cy.request({
    method: 'PUT',
    url: 'http://localhost:3001/mock',
    body: JSON.stringify({
      enabled: true,
      shortValue: JSON.stringify(card),
      longValue,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * @returns {void}
 */
function removeCard() {
  cy.request({
    method: 'PUT',
    url: 'http://localhost:3001/mock',
    body: JSON.stringify({
      enabled: true,
      hasCard: false,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

beforeEach(() => {
  insertCard(ELECTION_MANAGER_CARD_DATA, electionSampleDefinition.electionData);

  cy.visit('/');

  // Authenticate
  for (const digit of ELECTION_MANAGER_CARD_DATA.p) {
    cy.contains(digit).click();
  }

  // Load election
  cy.contains('Load Election Definition').click();
  cy.get('#selectPrecinct').select('All Precincts');
  removeCard();

  // Back at the home screen
  cy.contains('Insert Poll Worker card to open');

  // Open polls
  insertCard(POLL_WORKER_CARD_DATA);
  cy.contains('Open Polls').click();
  cy.contains('Open Polls on VxMark Now').click();

  // Activate ballot
  cy.contains('Center Springfield').click();
  cy.contains('12').click();
  removeCard();
});
