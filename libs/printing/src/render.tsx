import { Page, chromium } from 'playwright';
import ReactDom from 'react-dom/server';
import React from 'react';
import { Buffer } from 'buffer';
import { ServerStyleSheet } from 'styled-components';
import {
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
  GlobalStyles,
  VxThemeProvider,
  FONT_AWESOME_STYLES,
} from '@votingworks/ui';
import { mapObject } from '@votingworks/basics';
import { OPTIONAL_EXECUTABLE_PATH_OVERRIDE } from './chromium';

const PLAYWRIGHT_PIXELS_PER_INCH = 96;

export interface PaperDimensions {
  width: number;
  height: number;
}

export const PAPER_DIMENSIONS = {
  Letter: { width: 8.5, height: 11 },
  LetterRoll: { width: 8.5, height: Infinity },
} satisfies Record<string, PaperDimensions>;

const DEFAULT_PDF_MARGIN_INCHES = {
  top: 0.5,
  right: 0.5,
  bottom: 0.5,
  left: 0.5,
} as const;
const DEFAULT_PDF_VERTICAL_MARGIN =
  DEFAULT_PDF_MARGIN_INCHES.bottom + DEFAULT_PDF_MARGIN_INCHES.top;
const DEFAULT_PDF_HORIZONTAL_MARGIN =
  DEFAULT_PDF_MARGIN_INCHES.left + DEFAULT_PDF_MARGIN_INCHES.right;

function inchesToText(inches: number): string {
  return `${inches}in`;
}

const HTML_DOCTYPE = '<!DOCTYPE html>';
const CONTENT_WRAPPER_ID = 'content-wrapper';

// coverage tool breaks on code evaluated within the browser
/* istanbul ignore next */
function getContentHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const rect = (
      (document as unknown as Document).getElementById(
        'content-wrapper' // CONTENT_WRAPPER_ID not defined in this scope
      ) as HTMLElement
    ).getBoundingClientRect();
    return rect.height + rect.top;
  });
}

export interface RenderSpec {
  document: JSX.Element | JSX.Element[];
  dimensions?: PaperDimensions;
  outputPath?: string;
}

export async function renderToPdf(spec: RenderSpec[]): Promise<Buffer[]>;
export async function renderToPdf(spec: RenderSpec): Promise<Buffer>;
export async function renderToPdf(
  spec: RenderSpec | RenderSpec[]
): Promise<Buffer | Buffer[]> {
  const specs = Array.isArray(spec) ? spec : [spec];

  const browser = await chromium.launch({
    // font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it
    args: ['--font-render-hinting=none'],
    executablePath: OPTIONAL_EXECUTABLE_PATH_OVERRIDE,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const buffers: Buffer[] = [];

  for (const {
    document,
    outputPath,
    dimensions: { width, height } = PAPER_DIMENSIONS.Letter,
  } of specs) {
    // set the viewport size such that the content is the same width as it will
    // be in the PDF, which allows us to determine the necessary height to fit
    // the page to the content. viewport height here is irrelevant, but we have to
    // set something.
    await page.setViewportSize({
      width:
        (width - DEFAULT_PDF_HORIZONTAL_MARGIN) * PLAYWRIGHT_PIXELS_PER_INCH,
      height:
        (PAPER_DIMENSIONS.Letter.height - DEFAULT_PDF_VERTICAL_MARGIN) *
        PLAYWRIGHT_PIXELS_PER_INCH,
    });

    const documentWithGlobalStyles = (
      <React.Fragment>
        {/* Initial report ported from VxAdmin, thus `desktop` theme to match styles */}
        <VxThemeProvider
          colorMode="desktop"
          sizeMode="desktop"
          screenType="builtIn"
        >
          <GlobalStyles />
        </VxThemeProvider>
        <div id={CONTENT_WRAPPER_ID}>{document}</div>
      </React.Fragment>
    );
    const sheet = new ServerStyleSheet();
    const reportHtml = ReactDom.renderToString(
      sheet.collectStyles(documentWithGlobalStyles)
    );
    const style = sheet.getStyleElement();
    sheet.seal();

    const documentHtml = ReactDom.renderToString(
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
          <style
            type="text/css"
            dangerouslySetInnerHTML={{
              __html: FONT_AWESOME_STYLES,
            }}
          />
          {style}
        </head>
        <body dangerouslySetInnerHTML={{ __html: reportHtml }} />
      </html>
    );

    // add the doctype so that the browser uses the correct user agent stylesheet
    await page.setContent(`${HTML_DOCTYPE}\n${documentHtml}`, {
      waitUntil: 'load',
    });

    const contentHeight =
      (await getContentHeight(page)) / PLAYWRIGHT_PIXELS_PER_INCH +
      DEFAULT_PDF_VERTICAL_MARGIN;
    buffers.push(
      await page.pdf({
        path: outputPath,
        width: inchesToText(width),
        height: inchesToText(
          height === Infinity
            ? Math.max(PAPER_DIMENSIONS.Letter.height, contentHeight)
            : PAPER_DIMENSIONS.Letter.height
        ),
        margin: mapObject(DEFAULT_PDF_MARGIN_INCHES, inchesToText),
        printBackground: true, // necessary to render shaded backgrounds
      })
    );
  }

  await context.close();
  await browser.close();

  return Array.isArray(spec) ? buffers : buffers[0];
}
