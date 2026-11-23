import { expect, onTestFinished, test } from 'vitest';
import ReactDomServer from 'react-dom/server';
import { chromium } from 'playwright';
import {
  ROBOTO_ITALIC_FONT_DECLARATIONS,
  ROBOTO_REGULAR_FONT_DECLARATIONS,
} from '@votingworks/ui';
import {
  BALLOT_FONT_DECLARATIONS,
  BALLOT_FONTS_ORIGIN,
  inlineBallotFonts,
  serveBallotFonts,
  servedFontDeclarations,
} from './ballot_fonts.js';
import { BaseStyles } from './base_styles.js';
import { BaseStyles as NhStateBaseStyles } from './ballot_templates/nh_state_ballot_components.js';

const INLINE_FONT_DECLARATIONS = [
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
].join('\n');

test('ballot font declarations reference fonts by URL', () => {
  expect(BALLOT_FONT_DECLARATIONS).not.toContain('data:');
  expect(BALLOT_FONT_DECLARATIONS.match(/@font-face/g)).toHaveLength(12);
  expect(BALLOT_FONT_DECLARATIONS.length).toBeLessThan(5_000);
  expect(BALLOT_FONT_DECLARATIONS).toContain(
    `url('${BALLOT_FONTS_ORIGIN}/0.ttf')`
  );
});

test('inlineBallotFonts restores the inline font declarations', () => {
  expect(inlineBallotFonts(BALLOT_FONT_DECLARATIONS)).toEqual(
    INLINE_FONT_DECLARATIONS
  );
});

test('servedFontDeclarations handles each supported font format', () => {
  const inline = [
    `src: url('data:font/woff2;charset=utf-8;base64,d29mZjI=') format('woff2'),`,
    `  url("data:font/woff;charset=utf-8;base64,d29mZg==") format('woff'),`,
    `  url(data:font/truetype;charset=utf-8;base64,dHRm) format('truetype');`,
  ].join('\n');
  const served = servedFontDeclarations(inline);
  expect(served).not.toContain('data:');
  expect(served.match(/\.woff2'\)/g)).toHaveLength(1);
  expect(served.match(/\.woff'\)/g)).toHaveLength(1);
  expect(served.match(/\.ttf'\)/g)).toHaveLength(1);
  expect(inlineBallotFonts(served)).toEqual(
    [
      `src: url('data:font/woff2;charset=utf-8;base64,d29mZjI=') format('woff2'),`,
      `  url('data:font/woff;charset=utf-8;base64,d29mZg==') format('woff'),`,
      `  url('data:font/truetype;charset=utf-8;base64,dHRm') format('truetype');`,
    ].join('\n')
  );
});

test('servedFontDeclarations leaves declarations without inline fonts alone', () => {
  expect(servedFontDeclarations('@font-face {}')).toEqual('@font-face {}');
});

test('servedFontDeclarations rejects inline fonts it cannot convert', () => {
  expect(() =>
    servedFontDeclarations(
      [
        `url('data:font/woff2;charset=utf-8;base64,d29mZjI=')`,
        `url('data:font/otf;base64,b3Rm')`,
      ].join('\n')
    )
  ).toThrow('Unrecognized inline font');
});

test('inlineBallotFonts leaves unknown font URLs alone', () => {
  const html = `src: url('${BALLOT_FONTS_ORIGIN}/99.ttf')`;
  expect(inlineBallotFonts(html)).toEqual(html);
});

test('serveBallotFonts serves every ballot font to pages', async () => {
  const browser = await chromium.launch();
  onTestFinished(() => browser.close());
  const context = await browser.newContext();
  await serveBallotFonts(context);
  const page = await context.newPage();

  await page.setContent(
    ReactDomServer.renderToStaticMarkup(
      <html>
        <head>
          <BaseStyles />
        </head>
        <body>
          {[100, 300, 400, 500, 700, 900].flatMap((fontWeight) =>
            ['normal', 'italic'].map((fontStyle) => (
              <p
                key={`${fontWeight}-${fontStyle}`}
                style={{ fontWeight, fontStyle }}
              >
                Ballot
              </p>
            ))
          )}
        </body>
      </html>
    )
  );

  /* eslint-disable no-restricted-globals -- runs in the browser */
  const statuses = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((font) => font.status);
  });
  /* eslint-enable no-restricted-globals */
  expect(statuses).toEqual(Array.from({ length: 12 }, () => 'loaded'));
});

test('serveBallotFonts responds with 404 for unknown fonts', async () => {
  const browser = await chromium.launch();
  onTestFinished(() => browser.close());
  const context = await browser.newContext();
  await serveBallotFonts(context);
  const page = await context.newPage();

  const missing = await page.goto(`${BALLOT_FONTS_ORIGIN}/99.ttf`);
  expect(missing?.status()).toEqual(404);
  const nonFont = await page.goto(`${BALLOT_FONTS_ORIGIN}/index.html`);
  expect(nonFont?.status()).toEqual(404);
});

test('serveBallotFonts serves the NH state ballot fonts', async () => {
  const browser = await chromium.launch();
  onTestFinished(() => browser.close());
  const context = await browser.newContext();
  await serveBallotFonts(context);
  const page = await context.newPage();

  const styles = ReactDomServer.renderToStaticMarkup(<NhStateBaseStyles />);
  expect(styles).not.toContain('data:');
  await page.setContent(
    ReactDomServer.renderToStaticMarkup(
      <html>
        <head>
          <NhStateBaseStyles />
        </head>
        <body>
          {[
            'Century Schoolbook',
            'Helvetica Condensed',
            'Times New Roman',
          ].flatMap((fontFamily) =>
            ['normal', 'bold'].map((fontWeight) => (
              <p
                key={`${fontFamily}-${fontWeight}`}
                style={{ fontFamily, fontWeight }}
              >
                Ballot
              </p>
            ))
          )}
        </body>
      </html>
    )
  );

  /* eslint-disable no-restricted-globals -- runs in the browser */
  const statuses = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((font) => font.status);
  });
  /* eslint-enable no-restricted-globals */
  expect(statuses).toEqual(Array.from({ length: 4 }, () => 'loaded'));

  const woff2Url = /url\('([^']+\.woff2)'\)/.exec(styles)?.[1];
  const contentType = await page.evaluate(
    async (url) => (await fetch(url)).headers.get('content-type'),
    woff2Url!
  );
  expect(contentType).toEqual('font/woff2');
});
