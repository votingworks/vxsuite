/* eslint-disable cypress/no-unnecessary-waiting */
const clickThoughPages = new Array(20) // number of contests for activation code 'VX.23.12'

describe('Review Page', () => {
  it('When navigating from contest, scroll to contest and place focus on contest.', () => {
    cy.visit('/#sample')
    cy.contains('Get Started').click()
    cy.contains('Start Voting').click()
    cy.wrap(clickThoughPages).each(() => {
      cy.contains('Next').click()
      cy.wait(250)
    })
    cy.contains('Review Selections').click()
    cy.get('#contest-county-commissioners').click()
    cy.contains('Review Ballot').click()
    cy.get('#contest-county-commissioners').should('be.visible')
    cy.focused().should('have.attr', 'id', 'contest-county-commissioners')
  })
})
