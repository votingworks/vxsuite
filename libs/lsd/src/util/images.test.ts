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

import { readGrayscaleImage } from './images'
import { join } from 'path'

test('readGrayscaleImage', async () => {
  const result = await readGrayscaleImage(
    join(__dirname, '../../docs/chairs.png')
  )
  expect(result.originalImageData).toEqual(
    expect.objectContaining({ width: 192, height: 192 })
  )
  expect(result.scale).toEqual(1)
  expect(result.imageData.data).toHaveLength(
    result.imageData.width * result.imageData.height
  )
})

test('readGrayscaleImage with scale', async () => {
  const result = await readGrayscaleImage(
    join(__dirname, '../../docs/chairs.png'),
    { scale: 0.5 }
  )
  expect(result.originalImageData).toEqual(
    expect.objectContaining({ width: 192, height: 192 })
  )
  expect(result.scale).toEqual(0.5)
  expect(result.imageData.data).toHaveLength(
    result.imageData.width * result.imageData.height
  )
})

test('readGrayscaleImage with size', async () => {
  const result = await readGrayscaleImage(
    join(__dirname, '../../docs/chairs.png'),
    { size: { width: 48, height: 48 } }
  )
  expect(result.originalImageData).toEqual(
    expect.objectContaining({ width: 192, height: 192 })
  )
  expect(result.scale).toEqual(0.25)
  expect(result.imageData.data).toHaveLength(
    result.imageData.width * result.imageData.height
  )
})

test('readGrayscaleImage with invalid size', async () => {
  await expect(
    readGrayscaleImage(join(__dirname, '../../docs/chairs.png'), {
      size: { width: 96, height: 48 },
    })
  ).rejects.toThrowError(
    `when specifying 'size', the aspect ratio of the new size (96x48) must equal the aspect ratio of the original size (192x192)`
  )
})
