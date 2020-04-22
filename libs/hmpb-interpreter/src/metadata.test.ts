import { createImageData } from 'canvas'
import { croppedQRCode, templatePage1 } from '../test/fixtures'
import { decodeSearchParams, detect } from './metadata'
import { vh as flipVH } from './utils/flip'

test('URL decoding', () => {
  expect(
    decodeSearchParams(
      new URLSearchParams([
        ['t', 'tt'],
        ['pr', 'Acme & Co'],
        ['bs', 'Ballot Style Orange'],
        ['p', '2-3'],
      ])
    )
  ).toEqual({
    ballotStyleId: 'Ballot Style Orange',
    precinctId: 'Acme & Co',
    isTestBallot: true,
    pageNumber: 2,
    pageCount: 3,
  })
})

test('live mode', () => {
  expect(
    decodeSearchParams(
      new URLSearchParams([
        ['t', '_t'],
        ['pr', ''],
        ['bs', ''],
        ['p', '1-1'],
      ])
    )
  ).toEqual(expect.objectContaining({ isTestBallot: false }))
})

test('cropped QR code', async () => {
  await expect(detect(await croppedQRCode.imageData())).rejects.toThrow(
    'Expected QR code not found.'
  )
})

test('ballot', async () => {
  expect(await detect(await templatePage1.imageData())).toEqual({
    metadata: {
      ballotStyleId: '77',
      precinctId: '42',
      isTestBallot: true,
      pageNumber: 1,
      pageCount: 2,
    },
    flipped: false,
  })
})

test('custom QR code reader', async () => {
  expect(
    await detect(createImageData(85, 110), {
      decodeQRCode: async () =>
        Buffer.from('https://vx.vote?t=t&pr=11&bs=22&p=3-4'),
    })
  ).toEqual({
    metadata: {
      ballotStyleId: '22',
      precinctId: '11',
      isTestBallot: true,
      pageNumber: 3,
      pageCount: 4,
    },
    flipped: false,
  })
})

test('upside-down ballot images', async () => {
  expect(await detect(flipVH(await templatePage1.imageData()))).toEqual({
    metadata: {
      ballotStyleId: '77',
      precinctId: '42',
      isTestBallot: true,
      pageNumber: 1,
      pageCount: 2,
    },
    flipped: true,
  })
})
