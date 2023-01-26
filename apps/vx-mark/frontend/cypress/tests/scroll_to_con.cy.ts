/* eslint-disable cypress/no-unnecessary-waiting */

describe('Review Page', () => {
  const waitTime = 500;
  const clickThoughPages = Array.from({ length: 20 }); // number of contests for activation code 'VX.23.12'
  it('When navigating from contest, scroll to contest and place focus on contest.', () => {
    cy.wait(waitTime);
    cy.get('nav').contains('Start Voting').click();
    cy.wrap(clickThoughPages).each(() => {
      cy.contains('Next').click();
      cy.wait(waitTime);
    });
    cy.get('#contest-county-commissioners').click();
    cy.wait(waitTime);
    cy.contains('Review').click();
    cy.get('#contest-county-commissioners').should('be.visible');
    cy.focused().should('have.attr', 'id', 'contest-county-commissioners');
  });
});
