import { Browser, Page, chromium } from 'playwright';
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

export interface MarginDimensions {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGIN_DIMENSIONS: MarginDimensions = {
  top: 0.5,
  right: 0.5,
  bottom: 0.5,
  left: 0.5,
} as const;

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
  paperDimensions?: PaperDimensions;
  marginDimensions?: MarginDimensions;
  outputPath?: string;
  usePrintTheme?: boolean;
}

export async function renderToPdf(
  spec: RenderSpec[],
  browserOverride?: Browser
): Promise<Buffer[]>;
export async function renderToPdf(
  spec: RenderSpec,
  browserOverride?: Browser
): Promise<Buffer>;
export async function renderToPdf(
  spec: RenderSpec | RenderSpec[],
  browserOverride?: Browser
): Promise<Buffer | Buffer[]> {
  const specs = Array.isArray(spec) ? spec : [spec];

  const browser =
    browserOverride ||
    (await chromium.launch({
      // font hinting (https://fonts.google.com/knowledge/glossary/hinting)
      // is on by default, but causes fonts to render more awkwardly at higher
      // resolutions, so we disable it
      args: ['--font-render-hinting=none'],
      executablePath: OPTIONAL_EXECUTABLE_PATH_OVERRIDE,
    }));
  const context = await browser.newContext();
  const page = await context.newPage();

  const buffers: Buffer[] = [];

  for (const {
    document,
    outputPath,
    paperDimensions: { width, height } = PAPER_DIMENSIONS.Letter,
    marginDimensions = DEFAULT_MARGIN_DIMENSIONS,
    usePrintTheme,
  } of specs) {
    const verticalMargin = marginDimensions.top + marginDimensions.bottom;
    const horizontalMargin = marginDimensions.left + marginDimensions.right;

    // set the viewport size such that the content is the same width as it will
    // be in the PDF, which allows us to determine the necessary height to fit
    // the page to the content. viewport height here is irrelevant, but we have to
    // set something.
    await page.setViewportSize({
      width: (width - horizontalMargin) * PLAYWRIGHT_PIXELS_PER_INCH,
      height:
        (PAPER_DIMENSIONS.Letter.height - verticalMargin) *
        PLAYWRIGHT_PIXELS_PER_INCH,
    });

    const documentWithGlobalStyles = (
      <React.Fragment>
        {/* Initial report ported from VxAdmin, thus `desktop` theme to match styles */}
        {/* TODO: Migrate older prints to print theme. */}
        <VxThemeProvider
          colorMode={usePrintTheme ? 'print' : 'desktop'}
          sizeMode={usePrintTheme ? 'print' : 'desktop'}
          screenType="builtIn"
        >
          <GlobalStyles />
          <div id={CONTENT_WRAPPER_ID}>{document}</div>
        </VxThemeProvider>
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
      verticalMargin;
    buffers.push(
      await page.pdf({
        path: outputPath,
        width: inchesToText(width),
        height: inchesToText(
          height === Infinity
            ? Math.max(PAPER_DIMENSIONS.Letter.height, contentHeight)
            : PAPER_DIMENSIONS.Letter.height
        ),
        margin: {
          top: inchesToText(marginDimensions.top),
          right: inchesToText(marginDimensions.right),
          bottom: inchesToText(marginDimensions.bottom),
          left: inchesToText(marginDimensions.left),
        },
        printBackground: true, // necessary to render shaded backgrounds
      })
    );
  }

  await context.close();

  // Close the browser if it was created just for this render:
  if (!browserOverride) {
    await browser.close();
  }

  return Array.isArray(spec) ? buffers : buffers[0];
}
