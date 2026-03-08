import React from 'react';
import ReactDomServer from 'react-dom/server';
import { ServerStyleSheet } from 'styled-components';
import { assert } from '@votingworks/basics';
import { cpus } from 'node:os';
import { RenderContext, ElementInfo } from '@votingworks/pdf-renderer';
import {
  DocumentElement,
  RenderDocument,
  RenderScratchpad,
  Renderer,
  RendererPool,
  SingletonRenderer,
  Task,
  createScratchpad,
} from './renderer';

/**
 * Converts a `data-*` attribute name to the camelCase key that would appear in
 * an element's `dataset` (DOMStringMap). For example, `data-option-info`
 * becomes `optionInfo`.
 */
function dataAttrToCamelCase(name: string): string {
  const withoutPrefix = name.replace(/^data-/, '');
  return withoutPrefix.replace(/-([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase()
  );
}

/**
 * Renders a JSX element to an HTML string including styled-components styles.
 */
function renderJsxToHtml(element: JSX.Element): string {
  const sheet = new ServerStyleSheet();
  const elementHtml = ReactDomServer.renderToString(
    sheet.collectStyles(element)
  );
  const style = sheet.getStyleElement();
  sheet.seal();
  return ReactDomServer.renderToString(<>{style}</>) + elementHtml;
}

// The Rust renderer works in PDF points (72 DPI), but the ballot pipeline
// expects CSS pixels (96 DPI) to match Chromium's getBoundingClientRect().
const PT_TO_PX = 96 / 72;

function mapElements(elements: ElementInfo[]): DocumentElement[] {
  return elements.map((el) => {
    const data: Record<string, string> = {};
    for (const attr of el.attributes) {
      data[dataAttrToCamelCase(attr.name)] = attr.value;
    }
    return {
      x: el.x * PT_TO_PX,
      y: el.y * PT_TO_PX,
      width: el.width * PT_TO_PX,
      height: el.height * PT_TO_PX,
      data,
    };
  });
}

/**
 * Creates a {@link RenderDocument} backed by the Rust PDF renderer with
 * live DOM patching. The DOM is maintained in Rust and patched in-place
 * via `setContent`, avoiding full HTML re-parsing on every change.
 */
function createRustDocumentWithLiveDom(
  initialHtml: string,
  context: RenderContext
): RenderDocument {
  context.loadDocument(initialHtml);

  return {
    setContent(selector: string, element: JSX.Element): Promise<void> {
      const htmlContent = renderJsxToHtml(element);
      context.setContent(selector, htmlContent);
      return Promise.resolve();
    },

    getContent(): Promise<string> {
      return Promise.resolve(context.getContent());
    },

    inspectElements(selector: string): Promise<DocumentElement[]> {
      return Promise.resolve(mapElements(context.queryLive(selector)));
    },

    countElements(selector: string): Promise<number> {
      return Promise.resolve(context.countElements(selector));
    },

    setContentNoRelayout(
      selector: string,
      element: JSX.Element
    ): Promise<void> {
      const htmlContent = renderJsxToHtml(element);
      context.setContentNoRelayout(selector, htmlContent);
      return Promise.resolve();
    },

    renderToPdf(): Promise<Uint8Array> {
      return Promise.resolve(Uint8Array.from(context.renderLiveToPdf()));
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

/**
 * Creates a {@link Renderer} backed by the Rust PDF renderer.
 */
function createRustRendererInstance(): Omit<Renderer, 'close'> {
  return {
    createScratchpad(styles: JSX.Element): Promise<RenderScratchpad> {
      const stylesHtml = ReactDomServer.renderToStaticMarkup(styles);
      const html = `<!DOCTYPE html><html><head>${stylesHtml}</head><body></body></html>`;
      const context = new RenderContext(html);
      const document = createRustDocumentWithLiveDom(html, context);
      return Promise.resolve(createScratchpad(document));
    },

    loadDocumentFromContent(htmlContent: string): Promise<RenderDocument> {
      const loadContext = new RenderContext(htmlContent);
      return Promise.resolve(
        createRustDocumentWithLiveDom(htmlContent, loadContext)
      );
    },
  };
}

/**
 * Creates a {@link SingletonRenderer} backed by the Rust PDF renderer. Since
 * the Rust renderer is stateless, `close()` is a no-op.
 */
export function createRustRenderer(): Promise<SingletonRenderer> {
  const instance = createRustRendererInstance();
  return Promise.resolve({
    ...instance,
    close(): Promise<void> {
      return Promise.resolve();
    },
  });
}

/**
 * Creates a {@link RendererPool} backed by the Rust PDF renderer. Since the
 * Rust renderer is stateless (no browser to manage), this is a simple
 * concurrency wrapper.
 */
export function createRustRendererPool(
  size = cpus().length || 2
): Promise<RendererPool> {
  let isRunningTasks = false;

  async function runTasks<T>(
    tasks: Array<Task<T>>,
    emitProgress?: (progress: number, total: number) => void
  ): Promise<T[]> {
    assert(!isRunningTasks, 'Cannot run multiple sets of tasks concurrently');
    isRunningTasks = true;

    emitProgress?.(0, tasks.length);
    let numTasksCompleted = 0;

    try {
      const results = await runTasksConcurrently({
        tasks: tasks.map((task) => async () => {
          const renderer = createRustRendererInstance();
          const result = await task(renderer);
          numTasksCompleted += 1;
          emitProgress?.(numTasksCompleted, tasks.length);
          return result;
        }),
        concurrencyLimit: size,
      });

      return results;
    } finally {
      isRunningTasks = false;
    }
  }

  return Promise.resolve({
    runTasks,

    async runTask<T>(task: Task<T>): Promise<T> {
      const [result] = await runTasks([task]);
      return result;
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  });
}

type ExecutingTask<T> = Promise<{
  result: T;
  taskIndex: number;
  self: ExecutingTask<T>;
}>;

/**
 * Runs tasks with a concurrency limit, returning results in original order.
 * (Duplicated from playwright_renderer.tsx to avoid coupling.)
 */
async function runTasksConcurrently<T>({
  tasks,
  concurrencyLimit,
}: {
  tasks: Array<() => Promise<T>>;
  concurrencyLimit: number;
}): Promise<T[]> {
  const executing = new Set<ExecutingTask<T>>();
  const results: T[] = [];

  async function waitForNextCompletedTask(): Promise<void> {
    const completed = await Promise.race(executing);
    results[completed.taskIndex] = completed.result;
    executing.delete(completed.self);
  }

  for (const [taskIndex, task] of tasks.entries()) {
    const executingTask: ExecutingTask<T> = task().then((result) => ({
      result,
      taskIndex,
      self: executingTask,
    }));
    executing.add(executingTask);
    if (executing.size >= concurrencyLimit) {
      await waitForNextCompletedTask();
    }
  }

  while (executing.size > 0) {
    await waitForNextCompletedTask();
  }

  return results;
}
