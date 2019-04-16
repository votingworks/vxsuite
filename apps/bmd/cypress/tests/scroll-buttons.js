describe('Scroll Buttons', () => {
  /* eslint-disable cypress/no-unnecessary-waiting */

  it('Scroll buttons appear and function correctly', () => {
    cy.visit('/#sample')
    cy.getByTestId('activation-code').type('MyVoiceIsMyPassword', {
      force: true,
    })
    cy.contains('Submit').click({ force: true })
    cy.contains('Get Started').click()
    cy.contains('Next').click()
    cy.queryByText('↓ See More', { timeout: 0 }).should('not.be.visible')
    cy.contains('Next').click()
    cy.queryByText('↓ See More', { timeout: 0 }).should('not.be.visible')
    cy.contains('Next').click()
    cy.get('label').should('have.length', 26)
    cy.contains('Charlene Franz').should('be.visible')
    cy.contains('↓ See More').click()
    cy.wait(250)
    cy.contains('Charlene Franz', { timeout: 0 }).should('not.be.visible')
    cy.contains('↓ See More').click()
    cy.wait(250)
    cy.contains('↓ See More').click()
    cy.wait(250)
    cy.contains('↓ See More').click()
    cy.wait(250)
    cy.contains('Glenn Chandler').should('be.visible')
    cy.contains('↑ See More').click()
    cy.wait(250)
    cy.contains('↑ See More').click()
    cy.wait(250)
    cy.contains('↑ See More').click()
    cy.wait(250)
    cy.contains('↑ See More').click()
    cy.wait(250)
    cy.contains('Charlene Franz').should('be.visible')
  })

  /* eslint-enable cypress/no-unnecessary-waiting */

  it('Scroll buttons do not appear on smaller screens', () => {
    cy.viewport(375, 812) // iPhoneX
    cy.visit('/#sample')
    cy.getByTestId('activation-code').type('MyVoiceIsMyPassword', {
      force: true,
    })
    cy.contains('Submit').click({ force: true })
    cy.contains('Get Started').click()
    cy.contains('Next').click()
    cy.queryByText('↓ See More', { timeout: 0 }).should('not.be.visible')
    cy.contains('Next').click()
    cy.queryByText('↓ See More', { timeout: 0 }).should('not.be.visible')
    cy.contains('Next').click()
    cy.get('label').should('have.length', 26)
    cy.queryByText('↓ See More', { timeout: 0 }).should('not.be.visible')
  })
})
