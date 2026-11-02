import { test, expect, vi, onTestFinished } from 'vitest';
import { deferred, range } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { chromium } from 'playwright';
import { createPlaywrightRendererPool } from './playwright_renderer.js';
import { createDocument } from './renderer.js';

test('RendererPool errors if a task closes its page', async () => {
  const rendererPool = await createPlaywrightRendererPool();
  await expect(
    rendererPool.runTask(async (renderer) => {
      const document = await renderer.documentFromContent('<div/>');
      await document.close();
    })
  ).rejects.toThrow('Page should not be closed during task');
  await rendererPool.close();
});

test("RendererPool page can't be used after task completes", async () => {
  const rendererPool = await createPlaywrightRendererPool();
  const document = await rendererPool.runTask(async (renderer) =>
    renderer.documentFromContent('<div/>')
  );
  await expect(document.getContent()).rejects.toThrow(
    'Page is no longer available'
  );
  await rendererPool.close();
});

test('RendererPool can only run one set of tasks at a time', async () => {
  const rendererPool = await createPlaywrightRendererPool();
  await expect(() =>
    Promise.all(
      range(0, 2).map(() => rendererPool.runTasks([() => Promise.resolve()]))
    )
  ).rejects.toThrow('Cannot run multiple sets of tasks concurrently');
  // For some reason, this throws an error claiming the browser is already closed.
  // await rendererPool.close();
});

test('RendererPool runs tasks and returns results in order, reusing pages up to its size', async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const newPageSpy = vi.spyOn(context, 'newPage');
  vi.spyOn(chromium, 'launch').mockImplementation(() =>
    Promise.resolve({
      ...browser,
      newContext: async () => Promise.resolve(context),
    })
  );

  const poolSize = 5;
  const numTasks = 50;
  const rendererPool = await createPlaywrightRendererPool(poolSize);
  expect(
    await rendererPool.runTasks(
      range(0, numTasks).map((i) => async (renderer) => {
        const document = await renderer.documentFromContent(String(i));
        return document.getContent();
      })
    )
  ).toEqual(
    range(0, numTasks).map((i) => `<html><head></head><body>${i}</body></html>`)
  );
  expect(newPageSpy).toHaveBeenCalledTimes(poolSize);
  await browser.close();
  vi.restoreAllMocks();
});

test('RendererPool emits progress', async () => {
  const rendererPool = await createPlaywrightRendererPool();
  const emitProgress = vi.fn();
  const numTasks = 10;
  await rendererPool.runTasks(
    range(0, numTasks).map((i) => async (renderer) => {
      const document = await renderer.documentFromContent(String(i));
      return document.getContent();
    }),
    emitProgress
  );
  await rendererPool.close();
  expect(emitProgress).toHaveBeenCalledTimes(numTasks + 1);
  for (let i = 0; i <= numTasks; i += 1) {
    expect(emitProgress).toHaveBeenNthCalledWith(i + 1, i, numTasks);
  }
});

const TINY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

test('setContent waits for images to load', async () => {
  const browser = await chromium.launch();
  onTestFinished(() => browser.close());
  const page = await browser.newPage();
  const requested = deferred<void>();
  const release = deferred<void>();
  await page.route('**/slow.svg', async (route) => {
    requested.resolve();
    await release.promise;
    await route.fulfill({ contentType: 'image/svg+xml', body: TINY_SVG });
  });
  const document = createDocument({ page: () => page, void: () => undefined });
  let settled = false;
  const setContentPromise = document
    .setContent('body', <img src="http://localhost/slow.svg" />)
    .then(() => {
      settled = true;
    });
  await requested.promise;
  await page.evaluate(() => undefined);
  expect(settled).toEqual(false);
  release.resolve();
  await setContentPromise;
  const [image] = await document.inspectElements('img');
  expect(image?.width).toEqual(1);
});

test('setContent rejects when an image fails to load', async () => {
  const rendererPool = await createPlaywrightRendererPool();
  onTestFinished(() => rendererPool.close());
  const src = `data:image/svg+xml;base64,${Buffer.from('not an svg').toString('base64')}`;
  await expect(
    rendererPool.runTask(async (renderer) => {
      const document = await renderer.documentFromContent('<div/>');
      await document.setContent('body', <img src={src} />);
    })
  ).rejects.toThrow('Image failed to load');
});
