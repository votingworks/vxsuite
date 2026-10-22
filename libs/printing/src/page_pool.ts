import { Buffer } from 'node:buffer';
import type { Browser, BrowserContext, Page } from 'playwright';
import { assertDefined } from '@votingworks/basics';
import {
  ROBOTO_ITALIC_FONT_DECLARATIONS,
  ROBOTO_REGULAR_FONT_DECLARATIONS,
} from '@votingworks/ui';

const FONT_URL_PREFIX = 'https://fonts.vx.invalid/';

/** Inline font declarations, for documents that can't load fonts by URL. */
export const INLINE_FONT_DECLARATIONS = [
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
].join('\n');

const fontFiles: Buffer[] = [];

/**
 * Font declarations that load fonts from URLs served by pooled pages, so
 * Chromium parses and decodes each font once per page rather than per
 * document.
 */
export const FONT_DECLARATIONS = INLINE_FONT_DECLARATIONS.replace(
  /url\('data:font\/truetype;charset=utf-8;base64,([^']+)'\)/g,
  (_, base64: string) => {
    fontFiles.push(Buffer.from(base64, 'base64'));
    return `url('${FONT_URL_PREFIX}${fontFiles.length - 1}.ttf')`;
  }
);

interface PagePool {
  readonly context: Promise<BrowserContext>;
  readonly idlePages: Page[];
}

/** A pooled page and the font declarations documents loaded in it must use. */
export interface PageLease {
  readonly page: Page;
  readonly fontDeclarations: string;
  release(): void;
}

const pagePools = new WeakMap<Browser, PagePool>();

async function createContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.route(`${FONT_URL_PREFIX}*`, (route) =>
    route.fulfill({
      body: assertDefined(
        fontFiles[
          Number.parseInt(
            route.request().url().slice(FONT_URL_PREFIX.length),
            10
          )
        ]
      ),
      contentType: 'font/ttf',
      headers: { 'access-control-allow-origin': '*' },
    })
  );
  return context;
}

/**
 * Takes an idle page for `browser`, creating one if none is idle. Chromium
 * silently drops a PDF header template when the document loaded its fonts by
 * URL, so documents with a header get inline fonts.
 */
export async function acquirePage(
  browser: Browser,
  { hasHeader }: { hasHeader: boolean }
): Promise<PageLease> {
  let pool = pagePools.get(browser);
  if (!pool) {
    pool = { context: createContext(browser), idlePages: [] };
    pagePools.set(browser, pool);
  }
  const page = pool.idlePages.pop() ?? (await (await pool.context).newPage());
  const { idlePages } = pool;
  return {
    page,
    fontDeclarations: hasHeader ? INLINE_FONT_DECLARATIONS : FONT_DECLARATIONS,
    release() {
      idlePages.push(page);
    },
  };
}
