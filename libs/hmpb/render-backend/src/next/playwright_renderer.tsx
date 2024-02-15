import { chromium } from 'playwright';
import { RenderScratchpad, createDocument, createScratchpad } from './renderer';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function createPlaywrightRenderer() {
  const browser = await chromium.launch({
    // font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it
    args: ['--font-render-hinting=none'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const document = createDocument(page);

  return {
    createScratchpad(): RenderScratchpad {
      return createScratchpad(document);
    },

    async cleanup(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}
