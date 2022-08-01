import {
  enterPin,
  mockCardRemoval,
  mockSystemAdministratorCardInsertion,
} from '../support/auth';

describe('Election Manager and Module Converter MS SEMS configuration', () => {
  it('Election Manager can be configured with MS SEMS files', () => {
    cy.visit('/');
    mockSystemAdministratorCardInsertion();
    enterPin();
    mockCardRemoval();
    cy.contains('Convert from SEMS files').click();
    cy.get('input[name="SEMS main file"]').attachFile('semsMainFile.txt');
    cy.get('input[name="SEMS candidate mapping file"]').attachFile(
      'semsCandidateMappingFile.txt'
    );
    cy.contains('Election loading');
    cy.contains('Special Election for Senate 15');
    cy.contains('0d610ab44c');
    // The page renders twice when first loaded, make sure that is done before we navigate.
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(500);
    cy.contains('Definition').click();
    cy.contains('State Senate 15');
    cy.contains('District 15');
    cy.contains('Remove Election').click();
    cy.contains('Remove Election Definition').click();
  });
});
