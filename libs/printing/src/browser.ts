import { Browser, chromium } from 'playwright';

// This module deliberately imports nothing from `@votingworks/*`. Test setup
// files import it eagerly to register browser cleanup, and a setup file runs
// before the test file's `vi.mock` calls are registered, so anything it pulls
// into vitest's module runner is cached with its real bindings and can no
// longer be mocked. Keeping the browser cache free of workspace imports is
// what makes that eager import safe.

let cachedBrowser: Browser | undefined;

export async function launchBrowser(): Promise<Browser> {
  return await chromium.launch({
    // Font hinting (https://fonts.google.com/knowledge/glossary/hinting) is on by default, but
    // causes fonts to render awkwardly at higher resolutions, so we disable it
    args: ['--font-render-hinting=none'],
  });
}

// @coverage-exclude: cleanup function for vitest
export async function cleanupCachedBrowser(): Promise<void> {
  if (cachedBrowser) {
    await cachedBrowser.close();
  }
  cachedBrowser = undefined;
}

export async function getOrCreateCachedBrowser(): Promise<Browser> {
  if (!cachedBrowser || !cachedBrowser.isConnected()) {
    cachedBrowser = await launchBrowser();
  }
  return cachedBrowser;
}
