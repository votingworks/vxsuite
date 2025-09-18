import React from 'react';
import ReactDomServer from 'react-dom/server';
import { chromium } from 'playwright';
import { assert, range } from '@votingworks/basics';
import {
  RenderDocument,
  RenderScratchpad,
  Renderer,
  createDocument,
  createScratchpad,
} from './renderer';

export const RENDERER_CAPACITY = 5;

/**
 * Creates a {@link Renderer} that uses Playwright to drive a headless Chromium
 * instance.
 */
export async function createPlaywrightRenderer(): Promise<Renderer> {
  const browser = await chromium.launch({
    // Font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it.
    args: ['--font-render-hinting=none'],
  });
  const context = await browser.newContext();

  // We reuse the same page to avoid memory bloat. This means that only one
  // document can be in use at a time. You have to call `document.cleanup()` to
  // free up the page for another document. Not the best API, but I didn't want
  // to make a major API change yet given that we probably want to revisit this
  // to add some parallelism, which I anticipate requiring a larger API change.
  // TODO(jonah): Create a pool of pages so we can do parallelize rendering up
  // to a set capacity.
  const pages = await Promise.all(
    range(0, RENDERER_CAPACITY).map(async () => ({
      inUse: false,
      page: await context.newPage(),
    }))
  );

  function acquirePage() {
    const page = pages.find((p) => !p.inUse);
    assert(page, `All ${RENDERER_CAPACITY} rendering pages are in use`);
    page.inUse = true;
    return page.page;
  }

  function releasePage(page: (typeof pages)[number]['page']) {
    const pageInfo = pages.find((p) => p.page === page);
    assert(pageInfo, 'Released page not from pool');
    assert(pageInfo.inUse, 'Released page that was not in use');
    pageInfo.inUse = false;
  }

  return {
    async createScratchpad(styles): Promise<RenderScratchpad> {
      const page = acquirePage();
      await page.setContent(
        `<!DOCTYPE html>${ReactDomServer.renderToStaticMarkup(
          <html>
            <head>{styles}</head>
            <body />
          </html>
        )}`
      );
      const document = createDocument(page, () => releasePage(page));
      return createScratchpad(document);
    },

    async close(): Promise<void> {
      await context.close();
      await browser.close();
    },

    async loadDocumentFromContent(
      htmlContent: string
    ): Promise<RenderDocument> {
      const page = acquirePage();
      await page.setContent(htmlContent);
      return createDocument(page, () => releasePage(page));
    },
  };
}
