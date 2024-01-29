import { assertDefined } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { Page, chromium } from 'playwright';
import ReactDomServer from 'react-dom/server';
import {
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
} from '@votingworks/ui';
import { ServerStyleSheet } from 'styled-components';

export interface Dimensions<Unit extends number> {
  width: Unit;
  height: Unit;
}

export type Pixels = number;
export type PixelDimensions = Dimensions<Pixels>;
export type Inches = number;
export type InchDimensions = Dimensions<Inches>;

export interface PdfOptions {
  pageDimensions: InchDimensions;
  pageMargins: {
    top: Inches;
    right: Inches;
    bottom: Inches;
    left: Inches;
  };
}

async function createDocument(page: Page) {
  const pageContents = ReactDomServer.renderToStaticMarkup(
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
  );
  await page.setContent(`<!DOCTYPE html>${pageContents}`);

  return {
    async setBodyContent(element: JSX.Element): Promise<void> {
      const sheet = new ServerStyleSheet();
      const elementHtml = ReactDomServer.renderToString(
        sheet.collectStyles(element)
      );
      const style = sheet.getStyleElement();
      sheet.seal();
      const htmlContent =
        ReactDomServer.renderToString(<>{style}</>) + elementHtml;
      await page.evaluate((content) => {
        document.body.innerHTML = content;
      }, htmlContent);
    },

    async measureElements(
      selector: string
    ): Promise<Array<Dimensions<Pixels>>> {
      const nodes = await page
        .locator(selector)
        .and(page.locator(':not(style)'))
        .all();
      const dimensions = await Promise.all(
        nodes.map(async (node) => assertDefined(await node.boundingBox()))
      );
      return dimensions;
    },

    async getAttributeFromElements(
      selector: string,
      attributeName: string
    ): Promise<Array<string | null>> {
      const nodes = await page
        .locator(selector)
        .and(page.locator(':not(style)'))
        .all();
      const attributes = await Promise.all(
        nodes.map(async (node) => await node.getAttribute(attributeName))
      );
      return attributes;
    },

    async renderToPdf(options: PdfOptions): Promise<Buffer> {
      const pdf = await page.pdf({
        width: `${options.pageDimensions.width}in`,
        height: `${options.pageDimensions.height}in`,
        margin: {
          top: `${options.pageMargins.top}in`,
          right: `${options.pageMargins.right}in`,
          bottom: `${options.pageMargins.bottom}in`,
          left: `${options.pageMargins.left}in`,
        },
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
export async function createRenderer() {
  const browser = await chromium.launch({
    args: ['--font-render-hinting=none'],
  });
  const context = await browser.newContext();

  return {
    async createDocument(): Promise<RenderDocument> {
      const page = await context.newPage();
      return await createDocument(page);
    },

    async cleanup(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}

export type Renderer = Awaited<ReturnType<typeof createRenderer>>;
