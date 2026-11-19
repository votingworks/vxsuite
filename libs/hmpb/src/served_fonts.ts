import { Buffer } from 'node:buffer';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ROBOTO_ITALIC_FONT_DECLARATIONS,
  ROBOTO_REGULAR_FONT_DECLARATIONS,
} from '@votingworks/ui';
import { safeParseNumber } from '@votingworks/types';

const INLINE_FONT_URL_PATTERN =
  /url\((['"]?)data:font\/truetype;charset=utf-8;base64,([A-Za-z0-9+/=]+)\1\)/g;

const inlineFontDeclarations = [
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
].join('\n');

let server: Server | undefined;
let servedFontDeclarations: string | undefined;
let activeUsers = 0;

/**
 * Whether ballots load their fonts from a local font server instead of inlining
 * them, set by `VX_HMPB_FONTS=served` (an experiment for rendering benchmarks).
 */
export function isFontServingEnabled(): boolean {
  return process.env['VX_HMPB_FONTS'] === 'served';
}

/** The font declarations for ballot pages. */
export function fontDeclarations(): string {
  return servedFontDeclarations ?? inlineFontDeclarations;
}

/**
 * Starts serving the ballot fonts over HTTP so that Chromium caches them once
 * per browser instead of decoding them from every page.
 */
export async function startServingFonts(): Promise<void> {
  activeUsers += 1;
  if (server) return;
  const fonts: Buffer[] = [];
  const declarations = inlineFontDeclarations.replaceAll(
    INLINE_FONT_URL_PATTERN,
    (_match, _quote, base64: string) => {
      fonts.push(Buffer.from(base64, 'base64'));
      return `url('FONT_SERVER/font-${fonts.length - 1}.ttf')`;
    }
  );
  const newServer = createServer((request, response) => {
    const index = safeParseNumber(
      /\/font-(\d+)\.ttf$/.exec(request.url ?? '')?.[1]
    ).ok();
    const font = index === undefined ? undefined : fonts[index];
    if (!font) {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(200, {
        'content-type': 'font/ttf',
        'cache-control': 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
      })
      .end(font);
  });
  await new Promise<void>((resolve) => {
    newServer.listen(0, '127.0.0.1', resolve);
  });
  newServer.unref();
  const { port } = newServer.address() as AddressInfo;
  server = newServer;
  servedFontDeclarations = declarations.replaceAll(
    'FONT_SERVER',
    `http://127.0.0.1:${port}`
  );
}

/** Stops the font server once its last user is done. */
export async function stopServingFonts(): Promise<void> {
  activeUsers -= 1;
  if (activeUsers > 0 || !server) return;
  const closingServer = server;
  server = undefined;
  servedFontDeclarations = undefined;
  await new Promise<void>((resolve) => {
    closingServer.close(() => resolve());
  });
}
