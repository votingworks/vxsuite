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

import lsd from '.'

/**
 * Create a simple image: left half black, right half gray.
 */
function exampleImage({
  width = 128,
  height = 128,
}: { width?: number; height?: number } = {}): ImageData {
  const data = new Uint8ClampedArray(width * height)

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      data[x + y * width] = x < width / 2 ? 0.0 : 64.0
    }
  }

  return { data, width, height }
}

test('simple image', () => {
  expect(lsd(exampleImage())).toMatchInlineSnapshot(`
    Array [
      Object {
        "width": 1.2500000000000078,
        "x1": 63.59566474007385,
        "x2": 63.59566474007385,
        "y1": 0.625,
        "y2": 126.875,
      },
    ]
  `)
})

// `global.gc` is only defined when `--expose-gc` is provided to `node`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const gctest = global.gc ? test : test.skip

gctest('garbage collection reclaims buffer', () => {
  const iterations = 20
  const image = exampleImage()
  const expectedSegments = lsd(image).length
  const externalMemory = []
  let count = 0

  for (let i = 0; i < iterations; i++) {
    global.gc()
    externalMemory.push(process.memoryUsage().external)
    count += lsd(image).length
  }

  expect(count).toEqual(iterations * expectedSegments)

  const medianMemory = [...externalMemory].sort()[
    Math.round(externalMemory.length / 2)
  ]
  const finalMemory = externalMemory[externalMemory.length - 1]
  expect(Math.abs(medianMemory - finalMemory) / medianMemory).toBeLessThan(0.1)
})
