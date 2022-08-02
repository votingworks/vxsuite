import { electionMultiPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  electionMultiPartyPrimaryCypressHash,
  enterPin,
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '../support/auth';

describe('Election Manager can create SEMS tallies', () => {
  it('Election Manager can tally results properly', () => {
    cy.visit('/');
    mockSystemAdministratorCardInsertion();
    enterPin();
    mockCardRemoval();
    cy.contains('Convert from SEMS files');
    cy.get('input[type="file"]').attachFile(
      'electionMultiPartyPrimarySample.json'
    );
    cy.contains('Election loading');
    cy.contains(electionMultiPartyPrimaryCypressHash.slice(0, 10));
    cy.contains('Lock Machine').click();
    mockElectionManagerCardInsertion({
      electionData:
        electionMultiPartyPrimaryFixtures.electionDefinition.electionData,
      electionHash: electionMultiPartyPrimaryCypressHash,
    });
    enterPin();
    mockCardRemoval();
    cy.contains('Tally').click();
    cy.contains('Import CVR Files').click();
    cy.get('input[data-testid="manual-input"]').attachFile(
      'multiPartyPrimaryCVRResults.jsonl'
    );
    cy.contains('Close').click();
    cy.get('[data-testid="total-cvr-count"]').within(() =>
      cy.contains('4,530')
    );
    cy.contains('Reports').click();
    cy.contains('Save Results File').click();
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
