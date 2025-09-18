import React from 'react';
import ReactDomServer from 'react-dom/server';
import { chromium } from 'playwright';
import asyncPool from 'tiny-async-pool';
import { assert } from 'node:console';
import {
  Page,
  PageHandle,
  RenderDocument,
  RenderScratchpad,
  Renderer,
  RendererPool,
  SingletonRenderer,
  Task,
  createDocument,
  createScratchpad,
} from './renderer';

function createRendererFromPage(
  pageHandle: PageHandle
): Omit<Renderer, 'close'> {
  return {
    async createScratchpad(styles): Promise<RenderScratchpad> {
      await pageHandle.page().setContent(
        `<!DOCTYPE html>${ReactDomServer.renderToStaticMarkup(
          <html>
            <head>{styles}</head>
            <body />
          </html>
        )}`
      );
      const document = createDocument(pageHandle);
      return createScratchpad(document);
    },

    async loadDocumentFromContent(
      htmlContent: string
    ): Promise<RenderDocument> {
      await pageHandle.page().setContent(htmlContent);
      return createDocument(pageHandle);
    },
  };
}

function makePageHandle(page: Page): PageHandle {
  let voided = false;
  return {
    page(): Page {
      assert(!voided, 'Page is no longer available');
      return page;
    },
    void(): void {
      voided = true;
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
      const pageHandle = makePageHandle(await context.newPage());
      return createRendererFromPage(pageHandle).createScratchpad(styles);
    },

    async loadDocumentFromContent(
      htmlContent: string
    ): Promise<RenderDocument> {
      const pageHandle = makePageHandle(await context.newPage());
      return createRendererFromPage(pageHandle).loadDocumentFromContent(
        htmlContent
      );
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
      const pageHandle = makePageHandle(page);
      const renderer = createRendererFromPage(pageHandle);
      const result = await task(renderer);
      assert(!page.isClosed(), 'Page should not be closed during task');
      pageHandle.void();
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
