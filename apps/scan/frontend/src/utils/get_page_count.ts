import { printElementToPdf } from '@votingworks/ui';
import pdfjs from 'pdfjs-dist';
import { Buffer } from 'buffer';
import 'pdfjs-dist/build/pdf.worker.entry';

export async function getPageCount(element: JSX.Element): Promise<number> {
  const pdfBuffer = Buffer.from(await printElementToPdf(element));
  const pdf = await pdfjs.getDocument(pdfBuffer).promise;
  return pdf.numPages;
}
