import { createCanvas } from 'canvas'
import { getDocument } from 'pdfjs-dist'

/**
 * Renders PDF pages as images.
 */
export default async function* pdfToImages(
  pdfBytes: Buffer,
  { scale = 2 } = {}
): AsyncGenerator<ImageData> {
  const canvas = createCanvas(0, 0)
  const context = canvas.getContext('2d')
  const pdf = await getDocument(pdfBytes).promise

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({ canvasContext: context, viewport }).promise
    yield context.getImageData(0, 0, canvas.width, canvas.height)
  }
}
