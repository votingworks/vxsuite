import React from 'react';
import ReactDomServer from 'react-dom/server';
import { chromium } from 'playwright';
import {
  RenderDocument,
  RenderScratchpad,
  Renderer,
  createDocument,
  createScratchpad,
} from './renderer';
import { baseStyleElements } from './base_styles';

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
  return {
    async createScratchpad(): Promise<RenderScratchpad> {
      const page = await context.newPage();
      await page.setContent(
        `<!DOCTYPE html>${ReactDomServer.renderToStaticMarkup(
          <html>
            <head>{baseStyleElements}</head>
            <body />
          </html>
        )}`
      );
      const document = createDocument(page);
      return createScratchpad(document);
    },

    async cloneDocument(document: RenderDocument): Promise<RenderDocument> {
      const page = await context.newPage();
      await page.setContent(await document.getContent());
      return createDocument(page);
    },

    async cleanup(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}
