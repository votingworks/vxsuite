import * as jsfeat from 'jsfeat'

export default function readGrayscaleImage(
  imageData: ImageData
): jsfeat.matrix_t {
  const mat = new jsfeat.matrix_t(
    imageData.width,
    imageData.height,
    jsfeat.U8_t | jsfeat.C1_t
  )
  jsfeat.imgproc.grayscale(
    (imageData.data as unknown) as Float32Array,
    imageData.width,
    imageData.height,
    mat
  )
  return mat
}
