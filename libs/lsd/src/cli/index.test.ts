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

jest.mock('fs')

jest.mock('../util/images', () => ({
  readGrayscaleImage: jest.fn().mockImplementation(() => ({
    originalImageData: createImageData(1, 1),
    imageData: createImageData(1, 1),
    scale: 1,
  })),
}))

jest.mock('..', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue([]),
}))

import { WritableStream } from 'memory-streams'
import * as fs from 'fs'
import { PassThrough } from 'stream'
import { createHash } from 'crypto'
import { main } from '.'
import lsd from '..'
import { readGrayscaleImage } from '../util/images'
import { createImageData } from 'canvas'

const lsdMock = lsd as jest.MockedFunction<typeof lsd>
const createWriteStreamMock = fs.createWriteStream as jest.MockedFunction<
  typeof fs.createWriteStream
>
const readGrayscaleImageMock = readGrayscaleImage as jest.MockedFunction<
  typeof readGrayscaleImage
>

function captureNextFileWriter(): WritableStream {
  const writer = new WritableStream()
  createWriteStreamMock.mockReturnValueOnce(
    (writer as unknown) as fs.WriteStream
  )
  return writer
}

test('main does nothing given no arguments', async () => {
  await main([])
  expect(readGrayscaleImage).not.toHaveBeenCalled()
  expect(createWriteStreamMock).not.toHaveBeenCalled()
})

test('processes image files by path', async () => {
  captureNextFileWriter()
  captureNextFileWriter()

  await main(['a.png', 'b.png'], new PassThrough())

  expect(createWriteStreamMock).toHaveBeenNthCalledWith(1, 'a-lsd.svg', 'utf8')
  expect(createWriteStreamMock).toHaveBeenNthCalledWith(2, 'b-lsd.svg', 'utf8')
})

test('can filter line segments by absolute length', async () => {
  const out = captureNextFileWriter()

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 99, y2: 0, width: 1 },
    { x1: 0, y1: 0, x2: 100, y2: 0, width: 1 },
  ])

  await main(['a.png', '--min-length', '100'], new PassThrough())

  expect(out.toString()).toMatchInlineSnapshot(`
      "<?xml version=\\"1.0\\" standalone=\\"no\\"?>
        <!DOCTYPE svg PUBLIC \\"-//W3C//DTD SVG 1.1//EN\\"
        \\"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\\">
        <svg width=\\"1px\\" height=\\"1px\\" version=\\"1.1\\"
        xmlns=\\"http://www.w3.org/2000/svg\\" xmlns:xlink=\\"http://www.w3.org/1999/xlink\\">
      <line x1=\\"0\\" y1=\\"0\\" x2=\\"100\\" y2=\\"0\\" stroke-width=\\"1\\" stroke=\\"blue\\" />
      </svg>
      "
    `)
})

test('can filter line segments relative to image width', async () => {
  const out = captureNextFileWriter()

  const originalImageData = createImageData(10, 5)
  readGrayscaleImageMock.mockResolvedValueOnce({
    originalImageData,
    imageData: originalImageData,
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // length 4, filtered out
    { x1: 0, y1: 0, x2: 5, y2: 0, width: 1 }, // length 5
  ])

  await expect(
    main(['a.png', '--min-length', '50%w'], new PassThrough())
  ).resolves.toBeUndefined()

  expect(out.toString()).toMatchInlineSnapshot(`
    "<?xml version=\\"1.0\\" standalone=\\"no\\"?>
      <!DOCTYPE svg PUBLIC \\"-//W3C//DTD SVG 1.1//EN\\"
      \\"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\\">
      <svg width=\\"10px\\" height=\\"5px\\" version=\\"1.1\\"
      xmlns=\\"http://www.w3.org/2000/svg\\" xmlns:xlink=\\"http://www.w3.org/1999/xlink\\">
    <line x1=\\"0\\" y1=\\"0\\" x2=\\"5\\" y2=\\"0\\" stroke-width=\\"1\\" stroke=\\"blue\\" />
    </svg>
    "
  `)
})

test('can filter line segments relative to image height', async () => {
  const out = captureNextFileWriter()

  const originalImageData = createImageData(5, 10)
  readGrayscaleImageMock.mockResolvedValueOnce({
    originalImageData,
    imageData: originalImageData,
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 3, y2: 4, width: 1 }, // length 5
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // length 4, filtered out
  ])

  await expect(
    main(['a.png', '--min-length', '50%h'], new PassThrough())
  ).resolves.toBeUndefined()

  expect(out.toString()).toMatchInlineSnapshot(`
    "<?xml version=\\"1.0\\" standalone=\\"no\\"?>
      <!DOCTYPE svg PUBLIC \\"-//W3C//DTD SVG 1.1//EN\\"
      \\"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\\">
      <svg width=\\"5px\\" height=\\"10px\\" version=\\"1.1\\"
      xmlns=\\"http://www.w3.org/2000/svg\\" xmlns:xlink=\\"http://www.w3.org/1999/xlink\\">
    <line x1=\\"0\\" y1=\\"0\\" x2=\\"3\\" y2=\\"4\\" stroke-width=\\"1\\" stroke=\\"yellow\\" />
    </svg>
    "
  `)
})

test('color codes by direction', async () => {
  const out = captureNextFileWriter()

  const originalImageData = createImageData(10, 10)
  readGrayscaleImageMock.mockResolvedValueOnce({
    originalImageData,
    imageData: originalImageData,
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 0, y2: 4, width: 1 }, // down, yellow
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // right, blue
    { x1: 0, y1: 4, x2: 0, y2: 0, width: 1 }, // up, green
    { x1: 4, y1: 0, x2: 0, y2: 0, width: 1 }, // left, red
  ])

  await expect(main(['a.png'], new PassThrough())).resolves.toBeUndefined()

  expect(out.toString()).toMatchInlineSnapshot(`
    "<?xml version=\\"1.0\\" standalone=\\"no\\"?>
      <!DOCTYPE svg PUBLIC \\"-//W3C//DTD SVG 1.1//EN\\"
      \\"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\\">
      <svg width=\\"10px\\" height=\\"10px\\" version=\\"1.1\\"
      xmlns=\\"http://www.w3.org/2000/svg\\" xmlns:xlink=\\"http://www.w3.org/1999/xlink\\">
    <line x1=\\"0\\" y1=\\"0\\" x2=\\"0\\" y2=\\"4\\" stroke-width=\\"1\\" stroke=\\"yellow\\" />
    <line x1=\\"0\\" y1=\\"0\\" x2=\\"4\\" y2=\\"0\\" stroke-width=\\"1\\" stroke=\\"blue\\" />
    <line x1=\\"0\\" y1=\\"4\\" x2=\\"0\\" y2=\\"0\\" stroke-width=\\"1\\" stroke=\\"green\\" />
    <line x1=\\"4\\" y1=\\"0\\" x2=\\"0\\" y2=\\"0\\" stroke-width=\\"1\\" stroke=\\"red\\" />
    </svg>
    "
  `)
})

test('shows help', async () => {
  const stdout = new WritableStream()
  await expect(main(['--help'], stdout)).resolves.toEqual(undefined)
  expect(stdout.toString()).toMatchInlineSnapshot(`
    "lsd [3m[OPTIONS][23m IMAGE [3m[IMAGE …][23m

    [1mDescription[22m
    [1m[22mFind line segments in an image and write the result to a file.

    [1mOptions[22m
    [1m[22m -h, --help             Show this help.
         --min-length N     Filter line segments shorter than N pixels.
         --min-length N%w   Filter line segments shorter than N% of the image width.
         --min-length N%h   Filter line segments shorter than N% of the image height.
         --scale N          Resize the image before finding line segments.
                            If your results have segments broken up into small chunks,
                            try setting this to 80% or less to improve the results.
                            N can be a number (e.g. \\"0.75\\") or a percentage (e.g. \\"75%\\").
     -f, --format FORMAT    Write output file in FORMAT, one of \\"svg\\" (default) or \\"png\\".
     -b, --background BG    Draw background as BG, one of \\"none\\" (default), \\"white\\", or \\"original\\".

    [1mExamples[22m
    [1m[22m[2m# Find segments at least 20% of the width.[22m
    [2m[22m$ lsd --min-length 20%w image.png

    [2m# Scale down before searching for line segments.[22m
    [2m[22m$ lsd --scale 50% image.png

    [2m# Draw line segments on top of the original image.[22m
    [2m[22m$ lsd -b original image.png
    "
  `)
})

test('can output to PNG', async () => {
  const out = captureNextFileWriter()

  const originalImageData = createImageData(10, 10)
  readGrayscaleImageMock.mockResolvedValueOnce({
    originalImageData,
    imageData: originalImageData,
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 0, y2: 4, width: 1 }, // down, yellow
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // right, blue
    { x1: 0, y1: 4, x2: 0, y2: 0, width: 1 }, // up, green
    { x1: 4, y1: 0, x2: 0, y2: 0, width: 1 }, // left, red
  ])

  await expect(
    main(['--format', 'png', 'a.png'], new PassThrough())
  ).resolves.toEqual(undefined)

  const hash = createHash('md5')
  hash.update(out.toBuffer())
  expect(hash.digest('hex')).toMatchInlineSnapshot(
    `"cf92942109b497f82b8074dcb346a2d9"`
  )
})

test('can output to PNG on top of the original image', async () => {
  const out = captureNextFileWriter()

  const originalImageData = createImageData(10, 10)
  readGrayscaleImageMock.mockResolvedValueOnce({
    originalImageData,
    imageData: originalImageData,
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 0, y2: 4, width: 1 }, // down, yellow
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // right, blue
    { x1: 0, y1: 4, x2: 0, y2: 0, width: 1 }, // up, green
    { x1: 4, y1: 0, x2: 0, y2: 0, width: 1 }, // left, red
  ])

  await expect(
    main(
      ['--format', 'png', '--background', 'original', 'a.png'],
      new PassThrough()
    )
  ).resolves.toEqual(undefined)

  const hash = createHash('md5')
  hash.update(out.toBuffer())
  expect(hash.digest('hex')).toMatchInlineSnapshot(
    `"cf92942109b497f82b8074dcb346a2d9"`
  )
})

test('can output to PNG on a white background', async () => {
  const out = captureNextFileWriter()

  const originalImageData = createImageData(10, 10)
  readGrayscaleImageMock.mockResolvedValueOnce({
    originalImageData,
    imageData: originalImageData,
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 0, y2: 4, width: 1 }, // down, yellow
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // right, blue
    { x1: 0, y1: 4, x2: 0, y2: 0, width: 1 }, // up, green
    { x1: 4, y1: 0, x2: 0, y2: 0, width: 1 }, // left, red
  ])

  await expect(
    main(
      ['--format', 'png', '--background', 'white', 'a.png'],
      new PassThrough()
    )
  ).resolves.toEqual(undefined)

  const hash = createHash('md5')
  hash.update(out.toBuffer())
  expect(hash.digest('hex')).toMatchInlineSnapshot(
    `"443535a4d6d58c5ef59a9f9eedabb73c"`
  )
})

test('can output to SVG on top of the original image', async () => {
  const out = captureNextFileWriter()

  const originalImageData = createImageData(10, 10)
  readGrayscaleImageMock.mockResolvedValueOnce({
    originalImageData,
    imageData: originalImageData,
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 0, y2: 4, width: 1 }, // down, yellow
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // right, blue
    { x1: 0, y1: 4, x2: 0, y2: 0, width: 1 }, // up, green
    { x1: 4, y1: 0, x2: 0, y2: 0, width: 1 }, // left, red
  ])

  await main(['a.png', '--background', 'original'], new PassThrough())

  expect(out.toString()).toContain(`xlink:href="data:image/png;base64,`)
})

test('can output to SVG on a white background', async () => {
  const out = captureNextFileWriter()

  const originalImageData = createImageData(10, 10)
  readGrayscaleImageMock.mockResolvedValueOnce({
    originalImageData,
    imageData: originalImageData,
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 0, y2: 4, width: 1 }, // down, yellow
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // right, blue
    { x1: 0, y1: 4, x2: 0, y2: 0, width: 1 }, // up, green
    { x1: 4, y1: 0, x2: 0, y2: 0, width: 1 }, // left, red
  ])

  await main(['a.png', '--background', 'white'], new PassThrough())

  expect(out.toString()).toContain(`background-color: white`)
})
