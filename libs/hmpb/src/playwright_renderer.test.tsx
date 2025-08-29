import { test, expect } from 'vitest';
import { createPlaywrightRenderer } from './playwright_renderer';

test('only allows one document to be used at a time', async () => {
  const renderer = await createPlaywrightRenderer();
  const scratchpad = await renderer.createScratchpad(<style></style>);
  await expect(renderer.createScratchpad(<style></style>)).rejects.toThrow(
    'PlaywrightRenderer only supports rendering one document at a time'
  );
  const document = scratchpad.convertToDocument();
  await expect(renderer.createScratchpad(<style></style>)).rejects.toThrow(
    'PlaywrightRenderer only supports rendering one document at a time'
  );
  document.cleanup();
  await renderer.createScratchpad(<style></style>);
  await renderer.cleanup();
});
