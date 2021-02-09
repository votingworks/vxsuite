import { BallotType } from '@votingworks/types'
import { croppedQRCode } from '../test/fixtures'
import {
  election as urlQRCodeElection,
  blankPage1 as urlQRCodePage1,
} from '../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library'
import {
  election as binaryQRCodeElection,
  blankPage1 as binaryQRCodePage1,
} from '../test/fixtures/choctaw-county-mock-general-election-choctaw-2020-e87f23ca2c'
import * as choctaw2020Special from '../test/fixtures/choctaw-2020-09-22-f30480cc99'
import { decodeSearchParams, detect } from './metadata'
import { jsqr } from './utils/qrcode'

test('read base64-encoded binary metadata from QR code image', async () => {
  expect(
    await detect(
      choctaw2020Special.election,
      await choctaw2020Special.blankPage1.imageData()
    )
  ).toEqual({
    metadata: {
      ballotId: undefined,
      ballotStyleId: '1',
      ballotType: 0,
      electionHash: '02f807b005e006da160b',
      isTestMode: false,
      locales: {
        primary: 'en-US',
        secondary: undefined,
      },
      pageNumber: 1,
      precinctId: '6538',
    },
    flipped: false,
  })
})

test('read binary metadata from QR code image', async () => {
  expect(
    await detect(binaryQRCodeElection, await binaryQRCodePage1.imageData())
  ).toEqual({
    metadata: {
      locales: { primary: 'en-US', secondary: undefined },
      ballotStyleId: '1',
      precinctId: '6525',
      isTestMode: false,
      pageNumber: 1,
      electionHash:
        'e87f23ca2cc9feed24cf252920cecd26f1777746c634ea78debd1dc50e48a762',
      ballotType: BallotType.Standard,
    },
    flipped: false,
  })
})

describe('old-style URL-based metadata', () => {
  test('URL decoding', () => {
    expect(
      decodeSearchParams(
        new URLSearchParams([
          ['t', 'tt'],
          ['pr', 'Acme & Co'],
          ['bs', 'Ballot Style Orange'],
          ['p', '2-3'],
          ['l1', 'en-US'],
          ['l2', 'es-US'],
        ])
      )
    ).toEqual({
      locales: { primary: 'en-US', secondary: 'es-US' },
      ballotStyleId: 'Ballot Style Orange',
      precinctId: 'Acme & Co',
      isTestMode: true,
      pageNumber: 2,
      electionHash: '',
      ballotType: BallotType.Standard,
    })
  })

  test('omitted secondary locale code', () => {
    expect(
      decodeSearchParams(
        new URLSearchParams([
          ['t', 'tt'],
          ['pr', 'Acme & Co'],
          ['bs', 'Ballot Style Orange'],
          ['p', '2-3'],
          ['l1', 'en-US'],
        ])
      )
    ).toEqual({
      locales: { primary: 'en-US' },
      ballotStyleId: 'Ballot Style Orange',
      precinctId: 'Acme & Co',
      isTestMode: true,
      pageNumber: 2,
      electionHash: '',
      ballotType: BallotType.Standard,
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
          ['l1', 'en-US'],
        ])
      )
    ).toEqual(expect.objectContaining({ isTestMode: false }))
  })

  test('cropped QR code', async () => {
    await expect(
      detect(urlQRCodeElection, await croppedQRCode.imageData())
    ).rejects.toThrow('Expected QR code not found.')
  })

  test('ballot', async () => {
    expect(
      await detect(urlQRCodeElection, await urlQRCodePage1.imageData())
    ).toEqual({
      metadata: {
        locales: { primary: 'en-US' },
        ballotStyleId: '77',
        precinctId: '42',
        isTestMode: false,
        pageNumber: 1,
        electionHash: '',
        ballotType: BallotType.Standard,
      },
      flipped: false,
    })
  })

  test('alternate QR code reader', async () => {
    expect(
      await detect(urlQRCodeElection, await urlQRCodePage1.imageData(), {
        detectQRCode: jsqr,
      })
    ).toEqual({
      metadata: {
        locales: { primary: 'en-US' },
        ballotStyleId: '77',
        precinctId: '42',
        isTestMode: false,
        pageNumber: 1,
        electionHash: '',
        ballotType: BallotType.Standard,
      },
      flipped: false,
    })
  })

  test('custom QR code reader', async () => {
    expect(
      await detect(urlQRCodeElection, await urlQRCodePage1.imageData(), {
        detectQRCode: async () => ({
          data: Buffer.from('https://ballot.page?t=_&pr=11&bs=22&p=3-4'),
        }),
      })
    ).toEqual({
      metadata: {
        locales: { primary: 'en-US' },
        ballotStyleId: '22',
        precinctId: '11',
        isTestMode: false,
        pageNumber: 3,
        electionHash: '',
        ballotType: BallotType.Standard,
      },
      flipped: false,
    })
  })

  test('upside-down ballot images', async () => {
    expect(
      await detect(
        urlQRCodeElection,
        await urlQRCodePage1.imageData({ flipped: true })
      )
    ).toEqual({
      metadata: {
        locales: { primary: 'en-US' },
        ballotStyleId: '77',
        precinctId: '42',
        isTestMode: false,
        pageNumber: 1,
        electionHash: '',
        ballotType: BallotType.Standard,
      },
      flipped: true,
    })
  })
})
