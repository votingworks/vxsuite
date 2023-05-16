/* eslint-disable cypress/no-unnecessary-waiting */

const SCROLL_BUTTON_QUERY_OPTIONS = {
  name: 'More',
  hidden: true,
  timeout: 5,
} as const;

describe('Scroll Buttons', () => {
  const waitTime = 500;

  it('Scroll buttons appear and function correctly', () => {
    cy.wait(waitTime);
    cy.contains('Start Voting').click();
    cy.contains('Next').click();
    cy.wait(waitTime);
    cy.contains('Next').click();
    cy.wait(waitTime);
    cy.contains('Brad Plunkard').should('be.visible');
    cy.findAllByRole('button', SCROLL_BUTTON_QUERY_OPTIONS).should('not.exist');
    cy.contains('Next').click();
    cy.wait(waitTime);
    cy.findAllByRole('button', SCROLL_BUTTON_QUERY_OPTIONS).should(
      'have.length',
      1
    );
    cy.contains('Charlene Franz').should('be.visible');
    cy.findAllByRole('button', SCROLL_BUTTON_QUERY_OPTIONS).last().click();
    cy.wait(waitTime);
    cy.contains('Charlene Franz', { timeout: 0 }).should('not.be.visible');
    cy.contains('Henry Ash').should('be.visible');
    cy.findAllByRole('button', SCROLL_BUTTON_QUERY_OPTIONS).first().click();
    cy.wait(waitTime);
    cy.contains('Charlene Franz').should('be.visible');
  });
});
