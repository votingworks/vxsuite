import { JSDOM } from 'jsdom';

/**
 * Parses HTML into an Element.
 */
export function parseHtml(input: string): Element {
  // use DOMParser if available, i.e. the browser
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const document = parser.parseFromString(input, 'text/html');
    return document.body;
  }

  // otherwise use JSDOM, which is available in Node.js but not the browser
  const jsdom = new JSDOM(input);
  return jsdom.window.document.body;
}
