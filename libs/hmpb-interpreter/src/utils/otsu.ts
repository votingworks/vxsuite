/**
 * This file is based on the original C code from https://github.com/dlbeer/quirc/blob/cbf911edf072d11d2e6a5a0059e46e8f316c5fcf/lib/identify.c.
 *
 * quirc - QR-code recognition library
 * Copyright (C) 2010-2012 Daniel Beer <dlbeer@gmail.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const UINT8_MAX = (1 << 8) - 1

/**
 * Finds a threshold separating `data` into foreground and background values.
 *
 * @see https://en.wikipedia.org/wiki/Otsu%27s_method
 */
export default function otsu(data: Uint8Array | Uint8ClampedArray): number {
  const numPixels = data.length

  // Calculate histogram
  const histogram = new Int32Array(UINT8_MAX + 1)
  let ptr = 0
  let length = numPixels
  while (length--) {
    const value = data[ptr++]
    histogram[value]++
  }

  // Calculate weighted sum of histogram values
  let sum = 0
  let i = 0
  for (i = 0; i <= UINT8_MAX; ++i) {
    sum += i * histogram[i]
  }

  // Compute threshold
  let sumB = 0
  let q1 = 0
  let max = 0
  let threshold = 0
  for (i = 0; i <= UINT8_MAX; ++i) {
    // Weighted background
    q1 += histogram[i]
    if (q1 == 0) continue

    // Weighted foreground
    const q2 = numPixels - q1
    if (q2 == 0) break

    sumB += i * histogram[i]
    const m1 = sumB / q1
    const m2 = (sum - sumB) / q2
    const m1m2 = m1 - m2
    const variance = m1m2 * m1m2 * q1 * q2
    if (variance >= max) {
      threshold = i
      max = variance
    }
  }

  return threshold
}
