import { Buffer } from 'buffer';
import { Page, chromium } from 'playwright';
import ReactDomServer from 'react-dom/server';
import {
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
} from '@votingworks/ui';
import { ServerStyleSheet } from 'styled-components';
import { InchDimensions, PixelMeasurements } from './types';

export interface PdfOptions {
  pageDimensions: InchDimensions;
}

const emptyPageContentsWithFonts = `<!DOCTYPE html>${ReactDomServer.renderToStaticMarkup(
  <html>
    <head>
      <style
        type="text/css"
        dangerouslySetInnerHTML={{
          __html: [
            ROBOTO_REGULAR_FONT_DECLARATIONS,
            ROBOTO_ITALIC_FONT_DECLARATIONS,
          ].join('\n'),
        }}
      />
    </head>
    <body
      style={{
        fontFamily: 'Vx Roboto',
        margin: 0,
      }}
    ></body>
  </html>
)}`;

async function createDocument(page: Page) {
  await page.setContent(emptyPageContentsWithFonts);

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

async function createScratchpad(page: Page) {
  const document = await createDocument(page);

  return {
    async measureElements(
      content: JSX.Element,
      selector: string
    ): Promise<PixelMeasurements[]> {
      await document.setContent('body', content);
      return await document.inspectElements(selector);
    },

    async dispose(): Promise<void> {
      await document.dispose();
    },
  };
}

export type RenderScratchpad = Awaited<ReturnType<typeof createScratchpad>>;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function createRenderer() {
  const browser = await chromium.launch({
    // font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it
    args: ['--font-render-hinting=none'],
  });
  const context = await browser.newContext();

  return {
    async createDocument(): Promise<RenderDocument> {
      const page = await context.newPage();
      return await createDocument(page);
    },

    async createScratchpad(): Promise<RenderScratchpad> {
      const page = await context.newPage();
      return await createScratchpad(page);
    },

    async cleanup(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}

export type Renderer = Awaited<ReturnType<typeof createRenderer>>;
