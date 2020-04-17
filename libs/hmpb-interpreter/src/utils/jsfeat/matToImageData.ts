import { createCanvas } from 'canvas'
import * as jsfeat from 'jsfeat'

export default function matToImageData(mat: jsfeat.matrix_t): ImageData {
  const canvas = createCanvas(mat.cols, mat.rows)
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, mat.cols, mat.rows)
  const data_u32 = new Uint32Array(imageData.data.buffer)
  const alpha = 0xff << 24
  let i = mat.cols * mat.rows
  let pix = 0

  while (--i >= 0) {
    pix = mat.data[i]
    data_u32[i] = alpha | (pix << 16) | (pix << 8) | pix
  }

  return imageData
}
