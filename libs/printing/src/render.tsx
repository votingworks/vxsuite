import { chromium } from 'playwright';
import ReactDom from 'react-dom/server';
import React from 'react';
import { Buffer } from 'buffer';
import { ServerStyleSheet } from 'styled-components';
import {
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
  GlobalStyles,
  VxThemeProvider,
} from '@votingworks/ui';
import { OPTIONAL_EXECUTABLE_PATH_OVERRIDE } from './chromium';

const HTML_DOCTYPE = '<!DOCTYPE html>';

export async function renderToPdf(
  document: JSX.Element,
  outputPath?: string
): Promise<Buffer> {
  const documentWithGlobalStyles = (
    <React.Fragment>
      {/* Initial report ported from VxAdmin, thus `desktop` theme to match styles */}
      <VxThemeProvider
        colorMode="desktop"
        sizeMode="desktop"
        screenType="builtIn"
      >
        <GlobalStyles isTouchscreen={false} enableScroll={false} />
      </VxThemeProvider>
      {document}
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
        {style}
      </head>
      <body dangerouslySetInnerHTML={{ __html: reportHtml }} />
    </html>
  );

  const browser = await chromium.launch({
    // font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it
    args: ['--font-render-hinting=none'],
    executablePath: OPTIONAL_EXECUTABLE_PATH_OVERRIDE,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // we need to preface the HTML with a doctype so that the browser uses
  // the correct user agent stylesheet
  await page.setContent(`${HTML_DOCTYPE}\n${documentHtml}`);
  const pdfBuffer = await page.pdf({
    path: outputPath,
    format: 'letter',
    // margins copied from VxAdmin App.css
    margin: {
      top: '0.5in',
      right: '0.5in',
      bottom: '0.5in',
      left: '0.5in',
    },
    printBackground: true, // necessary to render shaded backgrounds
  });
  await context.close();
  await browser.close();

  return pdfBuffer;
}
