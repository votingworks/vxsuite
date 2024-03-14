import { Window, IHTMLElement } from 'happy-dom';

/**
 * Parses HTML into an Element.
 */
export function parseHtml(input: string): IHTMLElement {
  const window = new Window();
  window.document.body.innerHTML = input;
  return window.document.body;
}
