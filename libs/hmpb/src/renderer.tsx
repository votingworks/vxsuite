import React from 'react';
import { Buffer } from 'buffer';
import type { Page as PlaywrightPage } from 'playwright';
import ReactDomServer from 'react-dom/server';
import { ServerStyleSheet } from 'styled-components';
import { assert } from '@votingworks/basics';
import { PixelMeasurements } from './types';
import { PAGE_CLASS } from './ballot_components';

export type Page = Pick<
  PlaywrightPage,
  'evaluate' | 'close' | 'pdf' | 'content'
>;

/**
 * Creates a {@link RenderDocument}
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createDocument(page: Page) {
  return {
    /**
     * Given a selector to an individual element in the document, replaces the
     * element's inner content with the given JSX (rendered to HTML).
     */
    async setContent(selector: string, element: JSX.Element): Promise<void> {
      const sheet = new ServerStyleSheet();
      const elementHtml = ReactDomServer.renderToString(
        sheet.collectStyles(element)
      );
      const style = sheet.getStyleElement();
      sheet.seal();
      const htmlContent =
        ReactDomServer.renderToString(<>{style}</>) + elementHtml;
      // Using the Playwright API to query/manipulate the DOM is much slower
      // than running JS directly in the browser. We use `evaluate` to run the
      // given function in the browser and return the result.
      /* istanbul ignore next - code is evaluated in browser and doesn't work with coverage */
      await page.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-shadow
        ([selector, content]) => {
          const node = document.querySelector(selector);
          if (!node) {
            throw new Error(`No element found with selector: ${selector}`);
          }

          node.innerHTML = content;
          // After we set the innerHTML, we wait for the DOM to finish updating
          // with the new content. requestAnimationFrame will call the supplied
          // callback before the next repaint, so we call it twice to wait for
          // exactly one repaint to occur.
          return new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve();
              });
            });
          });
        },
        [selector, htmlContent]
      );
    },

    /**
     * Returns the current HTML content of the document.
     */
    async getContent(): Promise<string> {
      return await page.content();
    },

    /**
     * Given a CSS selector, returns measurements and data attributes for each
     * element in the document matching the selector.
     */
    async inspectElements(selector: string) {
      // Using the Playwright API to query/manipulate the DOM is much slower
      // than running JS directly in the browser. We use `evaluate` to run the
      // given function in the browser and return the result.
      /* istanbul ignore next - code is evaluated in browser and doesn't work with coverage */
      return await page.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-shadow
        (selector) => {
          const nodes = Array.from(document.querySelectorAll(selector));
          return nodes.map((node) => {
            const bounds = node.getBoundingClientRect();
            return {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
              // @ts-expect-error - dataset attribute exists
              data: node.dataset,
            };
          });
        },
        selector
      );
    },

    /**
     * Returns a PDF Buffer of the current document.
     */
    async renderToPdf(): Promise<Buffer> {
      const [pageDimensions] = await this.inspectElements(`.${PAGE_CLASS}`);
      const pdf = await page.pdf({
        width: `${pageDimensions.width}px`,
        height: `${pageDimensions.height}px`,
        printBackground: true,
      });
      return pdf;
    },
  };
}

/**
 * A single document (an HTML document loaded in a browser) that can be edited
 * and then rendered to PDF.
 */
export type RenderDocument = Awaited<ReturnType<typeof createDocument>>;

/**
 * Creates an {@link RenderScratchpad}
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createScratchpad(document: RenderDocument) {
  let hasBeenConvertedToDocument = false;
  return {
    async measureElements(
      content: JSX.Element,
      selector: string
    ): Promise<PixelMeasurements[]> {
      assert(
        !hasBeenConvertedToDocument,
        'Scratchpad has been converted to a document'
      );
      await document.setContent('body', content);
      return await document.inspectElements(selector);
    },

    convertToDocument(): RenderDocument {
      hasBeenConvertedToDocument = true;
      return document;
    },
  };
}

/**
 * A temporary document that can be used for laying out and measuring elements.
 */
export type RenderScratchpad = ReturnType<typeof createScratchpad>;

/**
 * A Renderer is a limited interface to a browser DOM rendering engine. It can
 * create a {@link RenderScratchpad} (for temporary layout and measurement),
 * which can then be converted to a {@link RenderDocument} (for final rendering to
 * PDF).
 *
 * Renderers should be cleaned up after use with {@link Renderer.cleanup}.
 */
export interface Renderer {
  /**
   * Creates a new {@link RenderScratchpad}.
   */
  createScratchpad(): Promise<RenderScratchpad>;

  /**
   * Given a {@link RenderDocument}, creates a new {@link RenderDocument} with the same content.
   */

  cloneDocument(document: RenderDocument): Promise<RenderDocument>;
  /**
   * Cleans up the resources used by the renderer (e.g. the browser instance).
   */
  cleanup(): Promise<void>;
}
