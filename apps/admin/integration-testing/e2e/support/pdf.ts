import * as cp from 'node:child_process';
import { promisify } from 'node:util';

/**
 * See `child_process.execFile` for details.
 */
export const execFile = promisify(cp.execFile);

/**
 * Convert a PDF file to text.
 */
export async function pdfToText(pdfPath: string): Promise<string> {
  const { stdout } = await execFile('pdftotext', [pdfPath, '-raw', '-']);
  return stdout;
}

/**
 * Replace our VxAdmin report dates with a fixed date.
 */
export function replaceReportDates(text: string): string {
  return text.replaceAll(
    /This report was created on [^\n]*\n/g,
    'This report was created on Monday, January 1, 2024 at 12:00:00 PM PST.\n'
  );
}

/**
 * Text converted from PDF will have wrapping lines as separate lines. Instead,
 * join them with spaces to make it easier to look for substrings.
 */
export function replaceLineBreaks(text: string): string {
  return text.split('\n').join(' ');
}

/**
 * Approximate number of pixels to scroll the PDF page scroller to change the page.
 * Unfortunately `scrollIntoViewIfNeeded` is not working within the PDF
 * viewer, so we use this tuned this scroll amount.
 */
export const PAGE_SCROLL_DELTA_Y = 1900;
