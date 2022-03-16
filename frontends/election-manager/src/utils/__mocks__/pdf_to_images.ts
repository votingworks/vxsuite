export const pdfToImages = jest.fn(
  async function* pdfToImages(): AsyncGenerator<{
    page: ImageData;
    pageNumber: number;
    pageCount: number;
  }> {
    // yield nothing
  }
);
