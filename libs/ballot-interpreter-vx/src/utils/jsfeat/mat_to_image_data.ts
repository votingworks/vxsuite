import * as jsfeat from 'jsfeat';
import { createImageData } from '../canvas';

export function matToImageData(mat: jsfeat.matrix_t): ImageData {
  const imageData = createImageData(mat.cols, mat.rows);
  const dataU32 = new Uint32Array(imageData.data.buffer);
  const alpha = 0xff << 24;
  let i = mat.cols * mat.rows;
  let pix = 0;

  for (; i >= 0; i -= 1) {
    pix = mat.data[i];
    dataU32[i] = alpha | (pix << 16) | (pix << 8) | pix;
  }

  return imageData;
}
