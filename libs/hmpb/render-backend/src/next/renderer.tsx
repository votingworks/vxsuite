import { Buffer } from 'buffer';
import type { Page as PlaywrightPage } from 'playwright';
import ReactDomServer from 'react-dom/server';
import { ServerStyleSheet } from 'styled-components';
import { assert } from '@votingworks/basics';
import { InchDimensions, PixelMeasurements } from './types';

export interface PdfOptions {
  pageDimensions: InchDimensions;
}

export type Page = Pick<PlaywrightPage, 'evaluate' | 'close' | 'pdf'>;

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

    async inspectElements(selector: string) {
      // Using the Playwright API to query/manipulate the DOM is much slower
      // than running JS directly in the browser. We use `evaluate` to run the
      // given function in the browser and return the result.
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

    async renderToPdf(options: PdfOptions): Promise<Buffer> {
      const { pageDimensions } = options;
      const pdf = await page.pdf({
        width: `${pageDimensions.width}in`,
        height: `${pageDimensions.height}in`,
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
  cleanup(): Promise<void>;
}
