import { promises as fs } from 'fs'
import { join } from 'path'
import pdfToImages from './pdfToImages'

async function asyncIterableToArray<T>(
  iterable: AsyncIterable<T>
): Promise<T[]> {
  const result: T[] = []

  for await (const value of iterable) {
    result.push(value)
  }

  return result
}

const ballotPath = join(
  __dirname,
  '../../test/fixtures/state-of-hamilton/ballot.pdf'
)

test('yields the right number of images sized correctly', async () => {
  const pdfBytes = await fs.readFile(ballotPath)
  const pages = await asyncIterableToArray(pdfToImages(pdfBytes))
  expect(pages.length).toEqual(5)

  const [
    {
      page: { width: width1, height: height1 },
    },
    {
      page: { width: width2, height: height2 },
    },
  ] = pages
  expect({ width: width1, height: height1 }).toEqual({
    width: 612,
    height: 792,
  })
  expect({ width: width2, height: height2 }).toEqual({
    width: 612,
    height: 792,
  })
})

test('can generate images with a different scale', async () => {
  const pdfBytes = await fs.readFile(ballotPath)
  const [
    {
      page: { width, height },
    },
  ] = await asyncIterableToArray(pdfToImages(pdfBytes, { scale: 2 }))
  expect({ width, height }).toEqual({ width: 1224, height: 1584 })
})
