import React from 'react';
import ReactDomServer from 'react-dom/server';
import { chromium } from 'playwright';
import { assert, assertDefined, iter } from '@votingworks/basics';
import { cpus } from 'node:os';
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

function launchChromium() {
  return chromium.launch({
    // Font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it.
    args: ['--font-render-hinting=none'],
  });
}

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

/**
 * Wraps a page in a handle that can later be voided. This enables {@link
 * RendererPool} to guarantee that a page is not used after its task completes,
 * so it can be safely reused by other tasks.
 */
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
 * scratchpad/document created (which is both slow and memory intensive), so it
 * should only be used for small workloads. Otherwise, default to using {@link
 * createPlaywrightRendererPool}.
 */
export async function createPlaywrightRenderer(): Promise<SingletonRenderer> {
  const browser = await launchChromium();
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

/**
 * Runs tasks with a concurrency limit, yielding results in the order the
 * tasks were provided.
 */
async function* runTasksConcurrently<T>({
  tasks,
  concurrencyLimit,
}: {
  tasks: Array<() => Promise<T>>;
  concurrencyLimit: number;
}): AsyncGenerator<T> {
  let nextTaskIndex = 0;
  const executing: Array<Promise<T>> = [];

  while (nextTaskIndex < tasks.length || executing.length > 0) {
    if (executing.length < concurrencyLimit && nextTaskIndex < tasks.length) {
      const task = tasks[nextTaskIndex];
      executing.push(task());
      nextTaskIndex += 1;
    } else {
      yield await assertDefined(executing.shift());
    }
  }
}

/**
 * Creates a {@link RendererPool} that uses Playwright to drive a headless
 * Chromium instance. The renderer pool can run multiple render tasks
 * concurrently and will reuse browser pages across tasks (up to the pool's
 * {@param size}).
 */
export async function createPlaywrightRendererPool(
  size = cpus().length || 2
): Promise<RendererPool> {
  const browser = await launchChromium();
  const context = await browser.newContext();

  const pages: Page[] = [];
  let isRunningTasks = false;

  async function* runTasks<T>(tasks: Array<Task<T>>): AsyncGenerator<T> {
    assert(!isRunningTasks, 'Cannot run multiple sets of tasks concurrently');
    isRunningTasks = true;
    yield* runTasksConcurrently({
      tasks: tasks.map((task) => async () => {
        const page = pages.pop() ?? (await context.newPage());
        const pageHandle = makePageHandle(page);
        const renderer = createRendererFromPage(pageHandle);
        const result = await task(renderer);
        assert(!page.isClosed(), 'Page should not be closed during task');
        pageHandle.void();
        pages.push(page);
        return result;
      }),
      concurrencyLimit: size,
    });
    isRunningTasks = false;
  }

  return {
    /**
     * Runs multiple render tasks concurrently, yielding results in the order
     * the tasks were provided. Only one set of tasks can be run at a time.
     */
    runTasks,

    /**
     * Runs a single task and returns the result. Cannot be run concurrently
     * with other tasks.
     */
    async runTask<T>(task: Task<T>): Promise<T> {
      const [result] = await iter(runTasks([task]))
        .async()
        .toArray();
      return result;
    },

    async close(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}
