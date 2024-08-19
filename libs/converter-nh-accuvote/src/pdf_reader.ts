import { assert, Optional } from '@votingworks/basics';
import { PdfPage, pdfToImages } from '@votingworks/image-utils';
import { Buffer } from 'buffer';

/**
 * Provides buffered page access to a PDF file.
 */
export class PdfReader {
  private pageRenderer?: AsyncIterator<PdfPage>;
  private readonly scale: number;
  private readonly pageCache = new Map<number, PdfPage>();

  constructor(
    private readonly pdfData: Buffer,
    { scale = 1 }: { scale?: number } = {}
  ) {
    this.scale = scale;
  }

  getOriginalData(): Buffer {
    return this.pdfData;
  }

  async *pages(): AsyncGenerator<PdfPage> {
    const pageCount = await this.getPageCount();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      yield (await this.getPage(pageNumber)) as PdfPage;
    }
  }

  async getPage(pageNumber: number): Promise<Optional<PdfPage>> {
    const cachedPage = this.getCachedPage(pageNumber);
    return cachedPage ?? this.renderPage(pageNumber);
  }

  private getCachedPage(pageNumber: number): Optional<PdfPage> {
    const cachedPage = this.pageCache.get(pageNumber);
    return cachedPage;
  }

  private setCachedPage(page: PdfPage): void {
    this.pageCache.set(page.pageNumber, page);
  }

  async getPageCount(): Promise<number> {
    const firstPage = await this.getPage(1);
    /* istanbul ignore next - in practice, there aren't PDFs with zero pages */
    return firstPage?.pageCount ?? 0;
  }

  private async renderPage(pageNumber: number): Promise<Optional<PdfPage>> {
    assert(pageNumber > 0, 'Page number must be greater than 0');

    const firstPage = this.getCachedPage(1);

    if (firstPage && firstPage.pageCount < pageNumber) {
      return undefined;
    }

    const iterator = this.getPageIterator();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await iterator.next();

      if (done) {
        return undefined;
      }

      if (value.pageNumber === pageNumber) {
        this.setCachedPage(value);
        return value;
      }
    }
  }

  private getPageIterator(): AsyncIterator<PdfPage> {
    if (!this.pageRenderer) {
      this.pageRenderer = pdfToImages(this.pdfData, { scale: this.scale })[
        Symbol.asyncIterator
      ]();
    }

    return this.pageRenderer;
  }
}
