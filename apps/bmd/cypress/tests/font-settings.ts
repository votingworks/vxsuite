// TODO: Remove this workaround: https://github.com/cypress-io/cypress/issues/1570#issuecomment-450966053
// when https://github.com/cypress-io/cypress/issues/1570 is resolved.
// See also: https://github.com/cypress-io/cypress/issues/1570#issuecomment-477382752
// @ts-ignore
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  // @ts-ignore
  window.HTMLInputElement.prototype,
  'value'
).set
// @ts-ignore
const changeRangeInputValue = $range => value => {
  // @ts-ignore
  nativeInputValueSetter.call($range[0], value)
  // @ts-ignore
  $range[0].dispatchEvent(new Event('change', { value, bubbles: true }))
}

describe('Font Settings', () => {
  it('Voter can adjust font settings', () => {
    cy.visit('/#sample')
    cy.contains('Get Started').click()
    cy.contains('Start Voting').click()
    cy.contains('Settings').click()
    cy.contains('Adjust the following settings to meet your needs.')
      .should('have.css', 'font-size')
      .should('eq', '24px')
    cy.get('#font-size')
      // .invoke('val', 0)
      // .trigger('change')
      .then(input => changeRangeInputValue(input)(0))
    cy.contains('Adjust the following settings to meet your needs.')
      .should('have.css', 'font-size')
      .should('eq', '18px')
    cy.get('#font-size')
      // .invoke('val', 1)
      // .trigger('change')
      .then(input => changeRangeInputValue(input)(1))
    cy.contains('Adjust the following settings to meet your needs.')
      .should('have.css', 'font-size')
      .should('eq', '24px')
    cy.get('#font-size')
      // .invoke('val', 2)
      // .trigger('change')
      .then(input => changeRangeInputValue(input)(2))
    cy.contains('Adjust the following settings to meet your needs.')
      .should('have.css', 'font-size')
      .should('eq', '28px')
    cy.get('#font-size')
      // .invoke('val', 3)
      // .trigger('change')
      .then(input => changeRangeInputValue(input)(3))
    cy.contains('Adjust the following settings to meet your needs.')
      .should('have.css', 'font-size')
      .should('eq', '32px')
  })
})
