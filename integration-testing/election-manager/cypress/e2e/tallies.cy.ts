import { electionMultiPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  enterPin,
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '../support/auth';

describe('Election Manager can create SEMS tallies', () => {
  it('Election Manager can tally results properly', () => {
    const { electionDefinition } = electionMultiPartyPrimaryFixtures;
    cy.visit('/');
    mockSystemAdministratorCardInsertion();
    enterPin();
    mockCardRemoval();
    cy.contains('Convert from SEMS files');
    cy.get('input[type="file"]').selectFile(
      { contents: Cypress.Buffer.from(electionDefinition.electionData) },
      { force: true }
    );
    cy.contains(electionDefinition.electionHash.slice(0, 10));
    cy.contains('Lock Machine').click();
    mockElectionManagerCardInsertion(
      electionMultiPartyPrimaryFixtures.electionDefinition
    );
    enterPin();
    mockCardRemoval();
    cy.contains('Tally').click();
    cy.contains('Load CVR Files').click();
    cy.get('input[data-testid="manual-input"]').selectFile(
      'cypress/fixtures/multiPartyPrimaryCVRResults.jsonl',
      { force: true }
    );
    cy.contains('Close').click();
    cy.get('[data-testid="total-cvr-count"]').within(() =>
      cy.contains('4,530')
    );
    cy.contains('Reports').click();
    cy.contains('Save SEMS Results').click();
    cy.get('[data-testid="manual-export"]').click();
    cy.contains('Results Saved');
    cy.task('readMostRecentFile', 'cypress/downloads').then((fileContent) => {
      const receivedLines = (fileContent as string).split('\r\n');
      for (const [i, expectedLine] of electionMultiPartyPrimaryFixtures.semsData
        .split('\r\n')
        .entries()) {
        expect(receivedLines[i].replace('\r\n', ': ')).to.eqls(expectedLine);
      }
    });
  });
});
