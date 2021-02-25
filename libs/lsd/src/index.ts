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

import { strict as assert } from 'assert'
import bindings from 'bindings'

const addon = bindings('lsd') as {
  lsd(
    image: Float64Array,
    width: number,
    height: number,
    scale?: number
  ): Float64Array
  LSD_RESULT_DIM: number
}

export interface LineSegment {
  x1: number
  x2: number
  y1: number
  y2: number
  width: number
}

export default function lsd(
  imageData: ImageData,
  { scale }: { scale?: number } = {}
): LineSegment[] {
  const { data, width, height } = imageData

  assert(typeof width === 'number' && width > 0)
  assert(typeof height === 'number' && height > 0)

  const channels = imageData.data.length / imageData.width / imageData.height

  assert.equal(
    channels,
    1,
    `expected a grayscale image, got a ${channels}-channel image`
  )

  const dst = Float64Array.from(data)
  const result = addon.lsd(dst, width, height, scale)

  assert.equal(result.length % addon.LSD_RESULT_DIM, 0, 'invalid dimension')

  const segments = new Array<LineSegment>(result.length / addon.LSD_RESULT_DIM)

  for (
    let ri = 0, si = 0;
    ri < result.length;
    ri += addon.LSD_RESULT_DIM, si++
  ) {
    const x1 = result[ri]
    const y1 = result[ri + 1]
    const x2 = result[ri + 2]
    const y2 = result[ri + 3]
    const width = result[ri + 4]
    segments[si] = { x1, y1, x2, y2, width }
  }

  return segments
}
