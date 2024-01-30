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
    async setContent(selector: string, element: JSX.Element): Promise<void> {
      const sheet = new ServerStyleSheet();
      const elementHtml = ReactDomServer.renderToString(
        sheet.collectStyles(element)
      );
      const style = sheet.getStyleElement();
      sheet.seal();
      const htmlContent =
        ReactDomServer.renderToString(<>{style}</>) + elementHtml;
      await page.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-shadow
        ([selector, content]) => {
          const node = document.querySelector(selector);
          if (node) node.innerHTML = content;
        },
        [selector, htmlContent]
      );
    },

    async inspectElements(selector: string) {
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
