import React from 'react';
import ReactDomServer from 'react-dom/server';
import { chromium } from 'playwright';
import asyncPool from 'tiny-async-pool';
import { assert } from 'node:console';
import {
  Page,
  RenderDocument,
  RenderScratchpad,
  Renderer,
  RendererPool,
  SingletonRenderer,
  Task,
  createDocument,
  createScratchpad,
} from './renderer';

function createRendererFromPage(page: Page): Omit<Renderer, 'close'> {
  return {
    async createScratchpad(styles): Promise<RenderScratchpad> {
      await page.setContent(
        `<!DOCTYPE html>${ReactDomServer.renderToStaticMarkup(
          <html>
            <head>{styles}</head>
            <body />
          </html>
        )}`
      );
      const document = createDocument(page);
      return createScratchpad(document);
    },

    async loadDocumentFromContent(
      htmlContent: string
    ): Promise<RenderDocument> {
      await page.setContent(htmlContent);
      return createDocument(page);
    },
  };
}

/**
 * Creates a {@link Renderer} that uses Playwright to drive a headless Chromium
 * instance. This renderer will create a new browser page for each
 * scratchpad/document created.
 */
export async function createPlaywrightRenderer(): Promise<SingletonRenderer> {
  const browser = await chromium.launch({
    // Font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it.
    args: ['--font-render-hinting=none'],
  });
  const context = await browser.newContext();

  return {
    async createScratchpad(styles): Promise<RenderScratchpad> {
      const page = await context.newPage();
      return createRendererFromPage(page).createScratchpad(styles);
    },

    async loadDocumentFromContent(
      htmlContent: string
    ): Promise<RenderDocument> {
      const page = await context.newPage();
      return createRendererFromPage(page).loadDocumentFromContent(htmlContent);
    },

    async close(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}

export async function createPlaywrightRendererPool(
  size: number
): Promise<RendererPool> {
  const browser = await chromium.launch({
    // Font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it.
    args: ['--font-render-hinting=none'],
  });
  const context = await browser.newContext();

  const pages: Page[] = [];

  async function* runTasks<T>(tasks: Array<Task<T>>): AsyncGenerator<T> {
    yield* asyncPool(size, tasks, async (task) => {
      const page = pages.pop() ?? (await context.newPage());
      const renderer = createRendererFromPage(page);
      const result = await task(renderer);
      assert(!page.isClosed(), 'Page should not be closed during task');
      pages.push(page);
      return result;
    });
  }

  return {
    runTasks,

    async runTask<T>(task: Task<T>): Promise<T> {
      return (await runTasks([task]).next()).value;
    },

    async close(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}
