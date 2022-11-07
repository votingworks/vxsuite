// This is a "polyfill" for the css pseudo-class :focus-visible
// https://caniuse.com/#feat=css-focus-visible

export function focusVisible(): void {
  // Let the document know when the mouse is being used
  document.body.addEventListener('mousedown', () => {
    document.body.classList.remove('using-keyboard');
  });

  // Re-enable focus styling when Tab is pressed
  document.body.addEventListener('keydown', (event) => {
    if (event.keyCode === 9) {
      document.body.classList.add('using-keyboard');
    }
  });
}
