import { Buffer } from 'node:buffer';
import type { BrowserContext } from 'playwright';
import { assert } from '@votingworks/basics';
import {
  ROBOTO_ITALIC_FONT_DECLARATIONS,
  ROBOTO_REGULAR_FONT_DECLARATIONS,
} from '@votingworks/ui';

/**
 * Origin for ballot font files. The `.invalid` TLD never resolves, so fonts
 * load only through the route registered by {@link serveBallotFonts}.
 */
export const BALLOT_FONTS_ORIGIN = 'https://ballot-fonts.vx.invalid';

const INLINE_FONT_URL_PATTERN =
  /url\((['"]?)data:font\/(truetype|woff2|woff);charset=utf-8;base64,([A-Za-z0-9+/=]+)\1\)/g;

const SERVED_FONT_URL_PATTERN = new RegExp(
  `url\\('${BALLOT_FONTS_ORIGIN}/([^']+)'\\)`,
  'g'
);

type FontFormat = 'truetype' | 'woff2' | 'woff';

const FILE_EXTENSIONS: Record<FontFormat, string> = {
  truetype: 'ttf',
  woff2: 'woff2',
  woff: 'woff',
};

const CONTENT_TYPES: Record<FontFormat, string> = {
  truetype: 'font/ttf',
  woff2: 'font/woff2',
  woff: 'font/woff',
};

interface BallotFont {
  readonly format: FontFormat;
  readonly base64: string;
}

const fontsByFileName = new Map<string, BallotFont>();

/**
 * Converts `@font-face` declarations with inline base64 font data into ones
 * that reference the fonts by URL, so Chromium loads and decodes each font
 * once rather than per document. The fonts are served by
 * {@link serveBallotFonts}.
 */
export function servedFontDeclarations(inlineDeclarations: string): string {
  const declarations = inlineDeclarations.replaceAll(
    INLINE_FONT_URL_PATTERN,
    (_match, _quote, format: FontFormat, base64: string) => {
      const fileName = `${fontsByFileName.size}.${FILE_EXTENSIONS[format]}`;
      fontsByFileName.set(fileName, { format, base64 });
      return `url('${BALLOT_FONTS_ORIGIN}/${fileName}')`;
    }
  );
  assert(!declarations.includes('data:'), 'Unrecognized inline font');
  return declarations;
}

/**
 * `@font-face` declarations for the Roboto fonts used by most ballot
 * templates.
 */
export const BALLOT_FONT_DECLARATIONS = servedFontDeclarations(
  [ROBOTO_REGULAR_FONT_DECLARATIONS, ROBOTO_ITALIC_FONT_DECLARATIONS].join('\n')
);

/**
 * Replaces ballot font URLs with inline data URLs, for documents rendered
 * where {@link serveBallotFonts} can't serve the fonts.
 */
export function inlineBallotFonts(html: string): string {
  return html.replaceAll(SERVED_FONT_URL_PATTERN, (match, fileName: string) => {
    const font = fontsByFileName.get(fileName);
    return font
      ? `url('data:font/${font.format};charset=utf-8;base64,${font.base64}')`
      : match;
  });
}

const fontBuffersByFileName = new Map<string, Buffer>();

function fontBuffer(font: BallotFont, fileName: string): Buffer {
  let buffer = fontBuffersByFileName.get(fileName);
  if (!buffer) {
    buffer = Buffer.from(font.base64, 'base64');
    fontBuffersByFileName.set(fileName, buffer);
  }
  return buffer;
}

/**
 * Serves the ballot fonts referenced by {@link servedFontDeclarations} to
 * pages in the given browser context from memory, without network access.
 */
export async function serveBallotFonts(context: BrowserContext): Promise<void> {
  await context.route(`${BALLOT_FONTS_ORIGIN}/**`, async (route) => {
    const fileName = route
      .request()
      .url()
      .slice(`${BALLOT_FONTS_ORIGIN}/`.length);
    const font = fontsByFileName.get(fileName);
    await route.fulfill(
      font
        ? {
            status: 200,
            contentType: CONTENT_TYPES[font.format],
            headers: { 'access-control-allow-origin': '*' },
            body: fontBuffer(font, fileName),
          }
        : { status: 404 }
    );
  });
}
