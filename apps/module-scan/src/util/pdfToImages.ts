import { createCanvas } from 'canvas'
import { getDocument } from 'pdfjs-dist'

/**
 * Renders PDF pages as images.
 */
export default async function* pdfToImages(
  pdfBytes: Buffer,
  { scale = 1 } = {}
): AsyncGenerator<ImageData> {
  const canvas = createCanvas(0, 0)
  const context = canvas.getContext('2d')
  const pdf = await getDocument(pdfBytes).promise

  // Yes, 1-indexing is correct.
  // https://github.com/mozilla/pdf.js/blob/6ffcedc24bba417694a9d0e15eaf16cadf4dad15/src/display/api.js#L2457-L2463
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({ canvasContext: context, viewport }).promise
    yield context.getImageData(0, 0, canvas.width, canvas.height)
  }
}
