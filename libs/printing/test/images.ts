import { iter } from '@votingworks/basics';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { readFile } from 'fs/promises';
import { tmpNameSync } from 'tmp';

export async function pdfToPageImages(pdfFile: string): Promise<string[]> {
  const pdfContents = await readFile(pdfFile);
  const pdfImages = pdfToImages(pdfContents, { scale: 200 / 72 });
  return await iter(pdfImages)
    .map(async ({ page }) => {
      // We need PNGs for jest-image-snapshot to work
      const path = tmpNameSync({ postfix: '.png' });
      await writeImageData(path, page);
      return path;
    })
    .toArray();
}
