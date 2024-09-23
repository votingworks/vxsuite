import { Browser, chromium } from 'playwright';
import { SimpleRenderer } from '@votingworks/types';
import { OPTIONAL_EXECUTABLE_PATH_OVERRIDE } from './chromium';

export async function launchBrowser(): Promise<Browser> {
  return await chromium.launch({
    // Font hinting (https://fonts.google.com/knowledge/glossary/hinting) is on by default, but
    // causes fonts to render awkwardly at higher resolutions, so we disable it
    args: ['--font-render-hinting=none'],
    executablePath: OPTIONAL_EXECUTABLE_PATH_OVERRIDE,
  });
}
export async function createSimpleRenderer(): Promise<SimpleRenderer> {
  const browser = await launchBrowser();
  return {
    getBrowser() {
      return browser;
    },
    async cleanup() {
      await browser.close();
    },
  };
}
