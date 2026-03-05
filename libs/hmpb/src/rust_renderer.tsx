import React from 'react';
import ReactDomServer from 'react-dom/server';
import { ServerStyleSheet } from 'styled-components';
import { assert } from '@votingworks/basics';
import { parse as parseHtml } from 'node-html-parser';
import { cpus } from 'node:os';
import {
  query as rustQuery,
  renderToPdf as rustRenderToPdf,
} from '@votingworks/pdf-renderer';
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

/**
 * Creates a {@link RenderDocument} backed by the Rust PDF renderer.
 *
 * HTML state is maintained in-memory as a string and manipulated with
 * `node-html-parser`. Queries and PDF rendering are delegated to the Rust
 * napi-rs bindings.
 */
function createRustDocument(initialHtml: string): RenderDocument {
  let html = initialHtml;

  return {
    setContent(selector: string, element: JSX.Element): Promise<void> {
      const htmlContent = renderJsxToHtml(element);
      const doc = parseHtml(html);
      const node = doc.querySelector(selector);
      assert(node !== null, `No element found with selector: ${selector}`);
      node.set_content(htmlContent);
      html = doc.toString();
      return Promise.resolve();
    },

    getContent(): Promise<string> {
      return Promise.resolve(html);
    },

    inspectElements(selector: string): Promise<DocumentElement[]> {
      const elements = rustQuery(html, selector);
      return Promise.resolve(
        elements.map((el) => {
          const data: Record<string, string> = {};
          for (const attr of el.attributes) {
            data[dataAttrToCamelCase(attr.name)] = attr.value;
          }
          return {
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            data,
          };
        })
      );
    },

    renderToPdf(): Promise<Uint8Array> {
      return Promise.resolve(Uint8Array.from(rustRenderToPdf(html)));
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
      const document = createRustDocument(html);
      return Promise.resolve(createScratchpad(document));
    },

    loadDocumentFromContent(htmlContent: string): Promise<RenderDocument> {
      return Promise.resolve(createRustDocument(htmlContent));
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
