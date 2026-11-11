import { Buffer } from 'node:buffer';
import { assertDefined, range } from '@votingworks/basics';
import type { PdfPreview } from '@votingworks/admin-backend';
import { screen, waitFor } from '../react_testing_library.js';

function previewSrc(content: string): string {
  return `data:image/png;base64,${Buffer.from(content).toString('base64')}`;
}

/** Builds a preview whose page images are the bytes of `content`. */
export function mockPdfPreview(content: string, pageCount = 1): PdfPreview {
  return {
    pageCount,
    pages: range(0, pageCount).map(() => ({
      png: Buffer.from(content),
      width: 612,
      height: 792,
    })),
  };
}

/** Returns the first preview page made by {@link mockPdfPreview} from `content`. */
export function queryPdfPreview(content: string): HTMLElement | null {
  const src = previewSrc(content);
  return (
    screen
      .queryAllByRole('img')
      .find((image) => image.getAttribute('src') === src) ?? null
  );
}

/** Waits for a preview page made by {@link mockPdfPreview} from `content`. */
export async function findPdfPreview(content: string): Promise<HTMLElement> {
  return await waitFor(() => assertDefined(queryPdfPreview(content)));
}
