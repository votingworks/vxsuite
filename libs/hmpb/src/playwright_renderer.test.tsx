import { test, expect, vi } from 'vitest';
import { range } from '@votingworks/basics';
import { chromium } from 'playwright';
import { createPlaywrightRendererPool } from './playwright_renderer';

test('RendererPool errors if a task closes its page', async () => {
  const rendererPool = await createPlaywrightRendererPool();
  await expect(
    rendererPool.runTask(async (renderer) => {
      const document = await renderer.loadDocumentFromContent('<div/>');
      await document.close();
    })
  ).rejects.toThrow('Page should not be closed during task');
  await rendererPool.close();
});

test("RendererPool page can't be used after task completes", async () => {
  const rendererPool = await createPlaywrightRendererPool();
  const document = await rendererPool.runTask(async (renderer) =>
    renderer.loadDocumentFromContent('<div/>')
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
        const document = await renderer.loadDocumentFromContent(String(i));
        return document.getContent();
      })
    )
  ).toEqual(
    range(0, numTasks).map((i) => `<html><head></head><body>${i}</body></html>`)
  );
  expect(newPageSpy).toHaveBeenCalledTimes(poolSize);
  await browser.close();
});
