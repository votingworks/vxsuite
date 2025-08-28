import React from 'react';
import ReactDomServer from 'react-dom/server';
import { chromium } from 'playwright';
import { assert } from '@votingworks/basics';
import {
  RenderDocument,
  RenderScratchpad,
  Renderer,
  createDocument,
  createScratchpad,
} from './renderer';

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
  const page = await context.newPage();
  let pageInUse = false;

  function acquirePage() {
    assert(
      !pageInUse,
      'PlaywrightRenderer only supports rendering one document at a time'
    );
    pageInUse = true;
  }

  function releasePage() {
    pageInUse = false;
  }

  return {
    async createScratchpad(styles): Promise<RenderScratchpad> {
      acquirePage();
      await page.setContent(
        `<!DOCTYPE html>${ReactDomServer.renderToStaticMarkup(
          <html>
            <head>{styles}</head>
            <body />
          </html>
        )}`
      );
      const document = createDocument(page, releasePage);
      return createScratchpad(document);
    },

    async cleanup(): Promise<void> {
      await context.close();
      await browser.close();
    },

    async loadDocumentFromContent(
      htmlContent: string
    ): Promise<RenderDocument> {
      acquirePage();
      await page.setContent(htmlContent);
      return createDocument(page, releasePage);
    },
  };
}
