import { pdfToImages, setPdfRenderWorkerSrc } from '@votingworks/image-utils';

// Configure browser PDF rendering to use the worker.
setPdfRenderWorkerSrc('/pdfjs-dist/pdf.worker.js');

export { pdfToImages };
