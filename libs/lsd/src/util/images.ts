/**
 * Copyright (C) 2021 VotingWorks
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { loadImage, createCanvas } from 'canvas'
import { approximatelyEqual, Size } from './geometry'

export async function readGrayscaleImage(
  path: string,
  { scale = 1, size }: { scale?: number; size?: Size } = {}
): Promise<{
  imageData: ImageData
  originalImageData: ImageData
  scale: number
}> {
  const image = await loadImage(path)
  let effectiveSize: Size
  let effectiveScale: number

  if (size) {
    const xScale = size.width / image.width
    const yScale = size.height / image.height

    if (!approximatelyEqual(xScale, yScale)) {
      throw new Error(
        `when specifying 'size', the aspect ratio of the new size (${size.width}x${size.height}) must equal the aspect ratio of the original size (${image.width}x${image.height})`
      )
    }

    effectiveSize = size
    effectiveScale = xScale
  } else {
    effectiveSize = {
      width: Math.round(image.width * scale),
      height: Math.round(image.height * scale),
    }
    effectiveScale = scale
  }

  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, image.width, image.height)
  const originalImageData = context.getImageData(
    0,
    0,
    image.width,
    image.height
  )
  context.drawImage(image, 0, 0, effectiveSize.width, effectiveSize.height)
  const imageData = context.getImageData(
    0,
    0,
    effectiveSize.width,
    effectiveSize.height
  )
  const src32 = new Int32Array(imageData.data.buffer)
  const dst = new Uint8ClampedArray(effectiveSize.width * effectiveSize.height)

  for (let offset = 0, { length } = src32; offset < length; offset += 1) {
    const px = src32[offset]
    const r = px & 0xff
    const g = (px >>> 8) & 0xff
    const b = (px >>> 16) & 0xff

    // Luminosity grayscale formula.
    const luminosity = (0.21 * r + 0.72 * g + 0.07 * b) | 0
    dst[offset] = luminosity
  }

  return {
    originalImageData,
    imageData: {
      data: dst,
      width: imageData.width,
      height: imageData.height,
    },
    scale: effectiveScale,
  }
}
