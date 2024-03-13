import { chromium } from 'playwright';
import ReactDomServer from 'react-dom/server';
import {
  RenderScratchpad,
  Renderer,
  createDocument,
  createScratchpad,
} from './renderer';
import { baseStyleElements } from './base_styles';

export async function createPlaywrightRenderer(): Promise<Renderer> {
  const browser = await chromium.launch({
    // font hinting (https://fonts.google.com/knowledge/glossary/hinting)
    // is on by default, but causes fonts to render more awkwardly at higher
    // resolutions, so we disable it
    args: ['--font-render-hinting=none'],
  });
  const context = await browser.newContext();
  return {
    async createScratchpad(): Promise<RenderScratchpad> {
      const page = await context.newPage();
      await page.setContent(
        `<!DOCTYPE html>${ReactDomServer.renderToStaticMarkup(
          <html>
            <head>{baseStyleElements}</head>
            <body />
          </html>
        )}`
      );
      const document = createDocument(page);
      return createScratchpad(document);
    },

    async cleanup(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}
