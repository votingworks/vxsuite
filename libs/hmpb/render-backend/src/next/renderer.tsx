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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createDocument(page: Page) {
  return {
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
        },
        [selector, htmlContent]
      );
    },

    async getContent(): Promise<string> {
      return await page.content();
    },

    async inspectElements(selector: string) {
      // Using the Playwright API to query/manipulate the DOM is much slower
      // than running JS directly in the browser. We use `evaluate` to run the
      // given function in the browser and return the result.
      /* istanbul ignore next - code is evaluated in browser and doesn't work with coverage */
      // eslint-disable-next-line @typescript-eslint/no-shadow
      return await page.evaluate((selector) => {
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
      }, selector);
    },

    async renderToPdf(): Promise<Buffer> {
      const [pageDimensions] = await this.inspectElements(`.${PAGE_CLASS}`);
      const pdf = await page.pdf({
        width: `${pageDimensions.width}px`,
        height: `${pageDimensions.height}px`,
        printBackground: true,
      });
      return pdf;
    },

    async dispose(): Promise<void> {
      await page.close();
    },
  };
}

export type RenderDocument = Awaited<ReturnType<typeof createDocument>>;

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

export type RenderScratchpad = ReturnType<typeof createScratchpad>;

export interface Renderer {
  createScratchpad(): Promise<RenderScratchpad>;
  cloneDocument(document: RenderDocument): Promise<RenderDocument>;
  cleanup(): Promise<void>;
}
