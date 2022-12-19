describe('Font Settings', () => {
  const globalFontSizes = [22, 28, 36];
  const label = 'Text Size';
  const buttons = '[data-testid="change-text-size-buttons"]';

  it('Voter can adjust font settings', () => {
    // Default font size
    cy.contains(label)
      .should('have.css', 'font-size')
      .should('eq', `${globalFontSizes[1]}px`);

    // Small font size
    cy.get(buttons).children().eq(0).click();
    cy.contains(label)
      .should('have.css', 'font-size')
      .should('eq', `${globalFontSizes[0]}px`);

    // Large font size
    cy.get(buttons).children().eq(2).click();
    cy.contains(label)
      .should('have.css', 'font-size')
      .should('eq', `${globalFontSizes[2]}px`);

    // Back to default font size
    cy.get(buttons).children().eq(1).click();
    cy.contains(label)
      .should('have.css', 'font-size')
      .should('eq', `${globalFontSizes[1]}px`);
  });
});
