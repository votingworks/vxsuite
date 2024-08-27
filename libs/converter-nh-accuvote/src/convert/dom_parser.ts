import { DOMParser } from '@xmldom/xmldom';
import { JSDOM } from 'jsdom';

/**
 * Parses HTML into an Element.
 */
export function parseHtml(input: string): Element {
  // otherwise use JSDOM, which is available in Node.js but not the browser
  const jsdom = new JSDOM(input);
  return jsdom.window.document.body;
}

/**
 * Parses {@link xml} and returns the root element.
 */
export function parseXml(xml: string): Element {
  return new DOMParser().parseFromString(xml, 'application/xml')
    .documentElement;
}
