import ReactDom from 'react-dom/server';
import React from 'react';
import { getEmptyElectionResults } from '@votingworks/utils';
import {
  AdminTallyReport,
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
  GlobalStyles,
  VxThemeProvider,
} from '@votingworks/ui';
import { safeParseElectionDefinition } from '@votingworks/types';
import { readFileSync } from 'fs';
import { ServerStyleSheet } from 'styled-components';
import { chromium } from 'playwright';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { getType } from 'mime';
import { Optional } from '@votingworks/basics';

// hardcoded to VxAdmin's public directory for now
const PUBLIC_DIR = join(__dirname, '../../../admin/frontend/public');

function getPublicPath(relativeUrl: string): Optional<string> {
  const publicPath = join(PUBLIC_DIR, relativeUrl);

  // trailing '/' is important and prevents path traversal
  if (!publicPath.startsWith(`${PUBLIC_DIR}/`)) {
    return;
  }

  return publicPath;
}

async function getPublicFileAsDataUrl(
  relativeUrl: string
): Promise<Optional<string>> {
  const publicPath = getPublicPath(relativeUrl);

  if (!publicPath) {
    return;
  }

  const mimeType = getType(publicPath);

  if (!mimeType) {
    return;
  }

  return `data:${mimeType};base64,${(await readFile(publicPath)).toString(
    'base64'
  )}`;
}

async function renderTallyReport(
  electionPath: string,
  outputPath: string
): Promise<void> {
  const electionDefinition = safeParseElectionDefinition(
    readFileSync(electionPath, 'utf8')
  ).unsafeUnwrap();
  const { election } = electionDefinition;
  const reportElement = (
    <React.Fragment>
      <VxThemeProvider>
        <GlobalStyles
          enableScroll={false}
          isTouchscreen={false}
          legacyBaseFontSizePx={0}
          legacyPrintFontSizePx={0}
        />
      </VxThemeProvider>
      <AdminTallyReport
        title="Tally Report"
        isOfficial={false}
        isTest={true}
        isForLogicAndAccuracyTesting={true}
        electionDefinition={electionDefinition}
        contests={election.contests}
        scannedElectionResults={getEmptyElectionResults(election, true)}
      />
    </React.Fragment>
  );
  const sheet = new ServerStyleSheet();
  const reportHtml = ReactDom.renderToString(
    sheet.collectStyles(reportElement)
  );
  const style = sheet.getStyleElement();
  sheet.seal();
  const tallyReportHtml = ReactDom.renderToString(
    <html>
      <head>
        <title>Tally Report</title>
        <style type="text/css">
          {ROBOTO_REGULAR_FONT_DECLARATIONS as unknown as string}
          {ROBOTO_ITALIC_FONT_DECLARATIONS as unknown as string}
        </style>
        {style}
      </head>
      <body dangerouslySetInnerHTML={{ __html: reportHtml }} />
    </html>
  );

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    console.log(msg);
  });

  await page.setContent(tallyReportHtml);
  await page.getByText('Tally Report').waitFor();
  const images = page.locator('//img');

  for (const img of await images.all()) {
    const src = await img.getAttribute('src');

    if (!src || !src.startsWith('/')) {
      console.log(`Skipping ${src} because it is not a public file`);
      continue;
    }

    const dataUrl = await getPublicFileAsDataUrl(src);

    if (!dataUrl) {
      console.log(`Skipping ${src} because it is not a public file`);
      continue;
    }

    await img.evaluate((element: HTMLImageElement, newSrc: string) => {
      // eslint-disable-next-line no-param-reassign
      element.src = newSrc;
      console.log(element.src);
    }, dataUrl);
  }

  await page.pdf({
    path: outputPath,
    format: 'letter',
    // Based on Electron defaults: https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions
    margin: {
      top: '1cm',
      right: '1cm',
      bottom: '1cm',
      left: '1cm',
    },
  });
  await context.close();
  await browser.close();
}

export async function main(args: readonly string[]): Promise<void> {
  if (args.length !== 2) {
    console.error('Usage: render-tally-report election.json output-path.pdf');
    process.exit(1);
  }
  await renderTallyReport(args[0], args[1]);
}
