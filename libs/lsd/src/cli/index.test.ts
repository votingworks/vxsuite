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

jest.mock('fs', () => ({
  createWriteStream: jest.fn().mockImplementation(() => ({
    write: jest.fn(),
    end: jest.fn().mockImplementation((...args: readonly unknown[]) => {
      const last = args[args.length - 1]
      if (typeof last === 'function') {
        last()
      }
    }),
  })),
}))

jest.mock('../util/images', () => ({
  readGrayscaleImage: jest.fn().mockImplementation(() => ({
    imageData: {
      data: Uint8ClampedArray.of(0),
      width: 1,
      height: 1,
    },
    originalSize: { width: 1, height: 1 },
    scale: 1,
  })),
}))

jest.mock('..', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue([]),
}))

import { createWriteStream } from 'fs'
import { PassThrough } from 'stream'
import { main } from '.'
import lsd from '..'
import { readGrayscaleImage } from '../util/images'

const lsdMock = lsd as jest.MockedFunction<typeof lsd>
const createWriteStreamMock = createWriteStream as jest.MockedFunction<
  typeof createWriteStream
>
const readGrayscaleImageMock = readGrayscaleImage as jest.MockedFunction<
  typeof readGrayscaleImage
>

function captureLastMockFileWrites(): string {
  const outFileMock =
    createWriteStreamMock.mock.results[
      createWriteStreamMock.mock.results.length - 1
    ]
  if (outFileMock.type !== 'return') {
    throw new Error(
      'expected last call to createWriteStream() to have a return value'
    )
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const writeMock = outFileMock.value.write as jest.MockedFunction<
    typeof outFileMock.value.write
  >
  return writeMock.mock.calls.map(([chunk]) => chunk as string).join('')
}

test('main does nothing given no arguments', async () => {
  await expect(main([])).resolves.toBeUndefined()
  expect(readGrayscaleImage).not.toHaveBeenCalled()
  expect(createWriteStream).not.toHaveBeenCalled()
})

test('processes image files by path', async () => {
  await expect(
    main(['a.png', 'b.png'], new PassThrough())
  ).resolves.toBeUndefined()

  expect(createWriteStream).toHaveBeenNthCalledWith(1, 'a-lsd.svg', 'utf8')
  expect(createWriteStream).toHaveBeenNthCalledWith(2, 'b-lsd.svg', 'utf8')
})

test('can filter line segments by absolute length', async () => {
  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 99, y2: 0, width: 1 },
    { x1: 0, y1: 0, x2: 100, y2: 0, width: 1 },
  ])
  await expect(
    main(['a.png', '--min-length', '100'], new PassThrough())
  ).resolves.toBeUndefined()
  expect(captureLastMockFileWrites()).toMatchInlineSnapshot(`
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
  readGrayscaleImageMock.mockResolvedValueOnce({
    imageData: {
      data: new Uint8ClampedArray(50),
      width: 10,
      height: 5,
    },
    originalSize: { width: 10, height: 5 },
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // length 4, filtered out
    { x1: 0, y1: 0, x2: 5, y2: 0, width: 1 }, // length 5
  ])

  await expect(
    main(['a.png', '--min-length', '50%w'], new PassThrough())
  ).resolves.toBeUndefined()

  expect(captureLastMockFileWrites()).toMatchInlineSnapshot(`
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
  readGrayscaleImageMock.mockResolvedValueOnce({
    imageData: {
      data: new Uint8ClampedArray(50),
      width: 5,
      height: 10,
    },
    originalSize: { width: 5, height: 10 },
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 3, y2: 4, width: 1 }, // length 5
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // length 4, filtered out
  ])

  await expect(
    main(['a.png', '--min-length', '50%h'], new PassThrough())
  ).resolves.toBeUndefined()

  expect(captureLastMockFileWrites()).toMatchInlineSnapshot(`
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
  readGrayscaleImageMock.mockResolvedValueOnce({
    imageData: {
      data: new Uint8ClampedArray(100),
      width: 10,
      height: 10,
    },
    originalSize: { width: 10, height: 10 },
    scale: 1,
  })

  lsdMock.mockReturnValueOnce([
    { x1: 0, y1: 0, x2: 0, y2: 4, width: 1 }, // down, yellow
    { x1: 0, y1: 0, x2: 4, y2: 0, width: 1 }, // right, blue
    { x1: 0, y1: 4, x2: 0, y2: 0, width: 1 }, // up, green
    { x1: 4, y1: 0, x2: 0, y2: 0, width: 1 }, // left, red
  ])

  await expect(main(['a.png'], new PassThrough())).resolves.toBeUndefined()

  expect(captureLastMockFileWrites()).toMatchInlineSnapshot(`
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
