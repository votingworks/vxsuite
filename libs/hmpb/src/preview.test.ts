import { HmpbBallotPaperSize } from '@votingworks/types';
import { join } from 'node:path';
import { stderr } from 'node:process';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { asyncDisposable } from '@votingworks/test-utils';
import { Browser, chromium } from 'playwright';
import { DONE_MARKER_ID } from './preview/browser_preview';

vi.setConfig({ testTimeout: 20_000 });

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({
    // Font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it.
    args: ['--font-render-hinting=none'],
  });
});

afterAll(async () => {
  await browser?.close();
});

test.each([
  { name: 'default' },
  { name: 'english-only', searchParams: { lang: ['en'] } },
  {
    name: 'famous-names-letter',
    searchParams: {
      electionUrl:
        '/libs-fixtures/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json',
      paperSize: HmpbBallotPaperSize.Letter,
    },
  },
])('preview: $name', async ({ searchParams }) => {
  // Start the Vite server.
  const { createServer } = await import('vite');
  await using vite = asyncDisposable(
    await createServer({
      root: join(__dirname, '../src/preview'),
      configFile: join(__dirname, '../vite.config.ts'),
    }),
    (s) => s.close()
  );

  await vite.listen();
  const { port } = vite.config.server;

  const page = await browser.newPage({
    viewport: {
      width: 1920,
      height: 1080,
    },
  });
  page.on('console', (message) => {
    if (!message.text().match(/has been externalized/)) {
      stderr.write(`[page:${message.type()}] ${message.text()}\n`);
    }
  });

  // Load the page and wait for the ballot to render.
  const search = new URLSearchParams();
  if (searchParams?.electionUrl) {
    search.set('election-url', searchParams.electionUrl);
  }
  if (searchParams?.paperSize) {
    search.set('paper-size', searchParams.paperSize);
  }
  if (searchParams?.lang) {
    for (const lang of searchParams.lang) {
      search.append('lang', lang);
    }
  }

  const url = new URL(`http://localhost:${port}/?${search}`);
  await page.goto(url.toString());
  await page.waitForSelector(`#${DONE_MARKER_ID}`, { state: 'attached' });

  // Take a screenshot and compare it to the snapshot.
  const screenshot = await page.screenshot({ fullPage: true });
  expect(screenshot).toMatchImageSnapshot();
});
