import * as jsfeat from 'jsfeat'

export type Lines = [rho: number, angle: number][]

export function hough_transform(
  img: jsfeat.matrix_t,
  rho_res: number,
  theta_res: number,
  threshold: number
): Lines {
  const image = img.data

  const width = img.cols
  const height = img.rows
  const step = width

  const min_theta = 0.0
  const max_theta = Math.PI

  const numangle = Math.round((max_theta - min_theta) / theta_res)
  const numrho = Math.round(((width + height) * 2 + 1) / rho_res)
  const irho = 1.0 / rho_res

  const accum = new Int32Array((numangle + 2) * (numrho + 2)) //typed arrays are initialized to 0
  const tabSin = new Float32Array(numangle)
  const tabCos = new Float32Array(numangle)

  let ang = min_theta
  for (let n = 0; n < numangle; n++) {
    tabSin[n] = Math.sin(ang) * irho
    tabCos[n] = Math.cos(ang) * irho
    ang += theta_res
  }

  // stage 1. fill accumulator
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      if (image[i * step + j] != 0) {
        //console.log(r, (n+1) * (numrho+2) + r+1, tabCos[n], tabSin[n]);
        for (let n = 0; n < numangle; n++) {
          let r = Math.round(j * tabCos[n] + i * tabSin[n])
          r += (numrho - 1) / 2
          accum[(n + 1) * (numrho + 2) + r + 1] += 1
        }
      }
    }
  }

  // stage 2. find local maximums
  //TODO: Consider making a vector class that uses typed arrays
  const _sort_buf = []
  for (let r = 0; r < numrho; r++) {
    for (let n = 0; n < numangle; n++) {
      const base = (n + 1) * (numrho + 2) + r + 1
      if (
        accum[base] > threshold &&
        accum[base] > accum[base - 1] &&
        accum[base] >= accum[base + 1] &&
        accum[base] > accum[base - numrho - 2] &&
        accum[base] >= accum[base + numrho + 2]
      ) {
        _sort_buf.push(base)
      }
    }
  }

  // stage 3. sort the detected lines by accumulator value
  // eslint-disable-next-line no-array-sort-mutation/no-array-sort-mutation
  _sort_buf.sort((l1, l2) =>
    accum[l1] > accum[l2] || (accum[l1] === accum[l2] && l1 < l2) ? 1 : 0
  )

  // stage 4. store the first min(total,linesMax) lines to the output buffer
  const linesMax = Math.min(numangle * numrho, _sort_buf.length)
  const scale = 1.0 / (numrho + 2)
  const lines: Lines = []
  for (let i = 0; i < linesMax; i++) {
    const idx = _sort_buf[i]
    const n = Math.floor(idx * scale) - 1
    const r = idx - (n + 1) * (numrho + 2) - 1
    const lrho = (r - (numrho - 1) * 0.5) * rho_res
    const langle = n * theta_res
    lines.push([lrho, langle])
  }
  return lines
}
