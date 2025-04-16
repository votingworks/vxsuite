/* eslint @typescript-eslint/no-use-before-define: ["error", { "functions": false }] */

import { assert, assertDefined } from '@votingworks/basics';
import { parse as parseHtml, Node, HTMLElement } from 'node-html-parser';

/**
 * Converts HTML tags to useful audio cues for the listener. Google Cloud
 * Text-to-Speech does not accept HTML tags, so we need to remove them. However,
 * removing them may change the meaning of the text, so we attempt to preserve
 * meaning by adding audio cues. Note that emphasis is not preserved, since it's
 * not crucial to understanding the meaning of the text.
 */
export function convertHtmlToAudioCues(text: string): string {
  const root = parseHtml(text);
  const simpleRoot = simplifyHtml(root);
  const convertedRoot = mapSimpleHtml(simpleRoot, (node) => {
    if ('tagName' in node) {
      switch (node.tagName) {
        case 'U':
          return {
            tagName: 'DIV',
            childNodes: [
              { textContent: '[begin underline] ' },
              { ...node },
              { textContent: ' [end underline]' },
            ],
          };
        case 'S':
          return {
            tagName: 'DIV',
            childNodes: [
              { textContent: '[begin strikethrough] ' },
              { ...node },
              { textContent: ' [end strikethrough]' },
            ],
          };
        case 'OL': {
          let itemIndex = 0;
          return {
            ...node,
            childNodes: node.childNodes.map((child) => {
              if ('tagName' in child && child.tagName === 'LI') {
                itemIndex += 1;
                return {
                  ...child,
                  childNodes: [
                    { textContent: `${itemIndex}. ` },
                    ...child.childNodes,
                    { textContent: '\n' },
                  ],
                };
              }
              return child;
            }),
          };
        }
        case 'TABLE': {
          return audioFriendlyTable(node);
        }
        case 'IMG':
          return { textContent: '[image]' };
        case 'SVG':
          return { textContent: '[image].' };
        default:
          break;
      }
    }
    return node;
  });
  return simpleHtmlToText(convertedRoot).trim();
}

interface HtmlTextNode {
  textContent: string;
}

interface HtmlElementNode {
  tagName: string;
  childNodes: SimpleHtmlNode[];
}

type SimpleHtmlNode = HtmlElementNode | HtmlTextNode;

/**
 * Translates a table element into "<label>: <value>" pairs for improved
 * speech synthesis
 */
function audioFriendlyTable(node: HtmlElementNode): HtmlElementNode {
  assert(node.tagName === 'TABLE');

  let lastHeader: SimpleHtmlNode[] = [];
  const fragments: SimpleHtmlNode[] = [];
  const nodesToVisit: HtmlElementNode[] = [];

  let curNode: HtmlElementNode | undefined = node;
  while (curNode) {
    for (const child of curNode.childNodes) {
      if (!('tagName' in child)) {
        continue;
      }

      switch (child.tagName) {
        case 'THEAD': {
          nodesToVisit.push(child);
          break;
        }
        case 'TBODY': {
          nodesToVisit.push(child);
          break;
        }
        case 'TR': {
          const { items, isHeader } = tableRowItems(child);
          if (isHeader) {
            lastHeader = items;
            break;
          }

          for (let i = 0; i < items.length; i += 1) {
            const heading = lastHeader[i];
            if (heading) {
              assert('textContent' in heading);

              // Columns (usually the first) may have empty headings.
              if (heading.textContent) {
                fragments.push(heading);
                fragments.push({ textContent: ': ' });
              }
            }

            fragments.push(assertDefined(items[i]));
            fragments.push({ textContent: '.\n' });
          }
          break;
        }
        default:
          break;
      }
    }
    curNode = nodesToVisit.shift();
  }

  return { tagName: 'SPAN', childNodes: fragments };
}

/**
 * Translates a table element into "<label>: <value>" pairs for improved
 * speech synthesis
 */
function tableRowItems(node: HtmlElementNode): {
  items: SimpleHtmlNode[];
  isHeader: boolean;
} {
  assert(node.tagName === 'TR');

  const items: SimpleHtmlNode[] = [];
  let isHeader = false;

  for (const child of node.childNodes) {
    if (!('tagName' in child)) {
      continue;
    }

    switch (child.tagName) {
      case 'TH': {
        // Assumes we don't have a mixed `td`/`th` row.
        isHeader = true;
        // Add contents with newlines stripped:
        items.push({ textContent: simpleHtmlToText(child).trim() });
        break;
      }
      case 'TD': {
        // Add contents with newlines stripped:
        items.push({ textContent: simpleHtmlToText(child).trim() });
        break;
      }
      default:
        break;
    }
  }

  return { items, isHeader };
}

// Convert HTML nodes to a plain data structure since it's more difficult to to
// modify the Nodes returned by the parser.
function simplifyHtml(node: Node): SimpleHtmlNode {
  if (node instanceof HTMLElement) {
    return {
      tagName: node.tagName ?? 'ROOT',
      childNodes: node.childNodes.map(simplifyHtml),
    };
  }
  return { textContent: node.textContent };
}

function mapSimpleHtml(
  node: SimpleHtmlNode,
  fn: (node: SimpleHtmlNode) => SimpleHtmlNode
): SimpleHtmlNode {
  if ('childNodes' in node) {
    return fn({
      tagName: node.tagName,
      childNodes: node.childNodes.map((child) => mapSimpleHtml(child, fn)),
    });
  }
  return fn(node);
}

function simpleHtmlToText(node: SimpleHtmlNode): string {
  if ('childNodes' in node) {
    return node.childNodes.map(simpleHtmlToText).join('');
  }
  return node.textContent;
}
