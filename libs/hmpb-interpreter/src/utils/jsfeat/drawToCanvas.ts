import { Canvas } from 'canvas'
import * as jsfeat from 'jsfeat'

export default function drawToCanvas(
  canvas: Canvas,
  mat: jsfeat.matrix_t
): void {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Please input the valid canvas element or id.')
  }
  if (!(mat instanceof jsfeat.matrix_t)) {
    throw new Error('Please input the valid jsfeat.matrix_t instance.')
  }
  const ctx = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, mat.cols, mat.rows)
  const data_u32 = new Uint32Array(imageData.data.buffer)
  const alpha = 0xff << 24
  let i = mat.cols * mat.rows,
    pix = 0
  while (--i >= 0) {
    pix = mat.data[i]
    data_u32[i] = alpha | (pix << 16) | (pix << 8) | pix
  }

  canvas.width = imageData.width
  canvas.height = imageData.height
  ctx.putImageData(imageData, 0, 0)
}
