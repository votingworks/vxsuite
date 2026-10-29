import { HmpbBallotPaperSize } from '@votingworks/types';
import { join } from 'node:path';
import { stderr } from 'node:process';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { type Browser, chromium } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { DONE_MARKER_ID } from './preview/browser_preview.js';

vi.setConfig({ testTimeout: 20_000 });

let browser: Browser;
let vite: ViteDevServer;

beforeAll(async () => {
  vite = await createServer({
    root: join(import.meta.dirname, '../src/preview'),
    configFile: join(import.meta.dirname, '../vite.config.ts'),
  });
  await vite.listen();
  browser = await chromium.launch({
    // Font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it.
    args: ['--font-render-hinting=none'],
  });
});

afterAll(async () => {
  await browser?.close();
  await vite?.close();
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
