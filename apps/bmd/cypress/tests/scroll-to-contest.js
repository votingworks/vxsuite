import electionSample from '../../src/data/electionSample'

const clickThoughPages = [...electionSample.contests, { id: 'pre-review-page' }]

describe('Review Page', () => {
  it('When navigating from contest, scroll to contest and place focus on contest.', () => {
    cy.visit('/#sample')
    cy.getByTestId('activation-code').type('VX.23.12D', {
      force: true,
    })
    cy.contains('Submit').click({ force: true })
    cy.contains('Get Started').click()
    cy.wrap(clickThoughPages).each(() => {
      cy.contains('Next').click()
    })
    cy.get('#county-commissioners').click()
    cy.contains('Review Ballot').click()
    cy.get('#county-commissioners').should('be.visible')
    cy.focused().should('have.attr', 'id', 'county-commissioners')
  })
})
