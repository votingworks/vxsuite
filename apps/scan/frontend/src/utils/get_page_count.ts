import { printElementToPdf } from '@votingworks/ui';
import pdfjs from 'pdfjs-dist';
import { Buffer } from 'buffer';
import 'pdfjs-dist/build/pdf.worker.entry';

export async function getPageCount(element: JSX.Element): Promise<number> {
  // mock for tests
  if (process.env.NODE_ENV === 'test') {
    return Promise.resolve(1);
  }

  // mock if doing development in the browser
  if (!window.kiosk) {
    return Promise.resolve(1);
  }

  const pdfBuffer = Buffer.from(await printElementToPdf(element));
  const pdf = await pdfjs.getDocument(pdfBuffer).promise;
  return pdf.numPages;
}
