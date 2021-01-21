import {
  BallotType,
  electionDefinitionSample,
  v1,
} from '@votingworks/ballot-encoder'
import { BallotPageMetadata } from '@votingworks/hmpb-interpreter'
import { join } from 'path'
import { BallotPageQrcode } from '../types'
import { loadImageData } from './images'
import { detectQRCode, inferMissingQrcode } from './qrcode'

test('falls back to jsQR if the other QR code readers cannot read them', async () => {
  const imageData = await loadImageData(
    join(__dirname, '../../test/fixtures/jsqr-only-qrcode.png')
  )
  expect(await detectQRCode(imageData)).toMatchInlineSnapshot(`
    Object {
      "data": Object {
        "data": Array [
          86,
          80,
          1,
          20,
          208,
          242,
          52,
          90,
          77,
          32,
          189,
          215,
          7,
          196,
          24,
          5,
          13,
          36,
          0,
          8,
          32,
        ],
        "type": "Buffer",
      },
      "detector": "jsQR",
      "position": "top",
    }
  `)
})

const { election, electionHash } = electionDefinitionSample
const bmdQrcode: BallotPageQrcode = {
  data: v1.encodeBallot(election, {
    ballotId: '',
    ballotStyle: election.ballotStyles[0],
    precinct: election.precincts[0],
    ballotType: BallotType.Standard,
    isTestMode: false,
    votes: {},
  }),
  position: 'top',
}
const hmpbP1Metadata: BallotPageMetadata = {
  ballotStyleId: election.ballotStyles[0].id,
  precinctId: election.precincts[0].id,
  ballotType: BallotType.Standard,
  electionHash,
  isTestMode: false,
  locales: { primary: 'en-US' },
  pageNumber: 1,
}
const hmpbP2Metadata: BallotPageMetadata = {
  ...hmpbP1Metadata,
  pageNumber: 2,
}
const hmpbP1Qrcode: BallotPageQrcode = {
  data: v1.encodeHMPBBallotPageMetadata(election, hmpbP1Metadata),
  position: 'bottom',
}
const hmpbP2Qrcode: BallotPageQrcode = {
  data: v1.encodeHMPBBallotPageMetadata(election, hmpbP2Metadata),
  position: 'bottom',
}

test('does not infer anything when both sides have no QR codes', async () => {
  expect(inferMissingQrcode(election, [undefined, undefined])).toEqual([
    undefined,
    undefined,
  ])
})

test('does not infer anything when one side has a BMD QR code', async () => {
  expect(inferMissingQrcode(election, [bmdQrcode, undefined])).toEqual([
    bmdQrcode,
    undefined,
  ])
  expect(inferMissingQrcode(election, [undefined, bmdQrcode])).toEqual([
    undefined,
    bmdQrcode,
  ])
})

test('does not infer anything when both sides have HMPB QR codes', async () => {
  expect(inferMissingQrcode(election, [hmpbP1Qrcode, hmpbP2Qrcode])).toEqual([
    hmpbP1Qrcode,
    hmpbP2Qrcode,
  ])
  expect(inferMissingQrcode(election, [hmpbP2Qrcode, hmpbP1Qrcode])).toEqual([
    hmpbP2Qrcode,
    hmpbP1Qrcode,
  ])
})

test('infers a missing QR code for HMPB page metadata when only one is present', async () => {
  expect(inferMissingQrcode(election, [hmpbP1Qrcode, undefined])).toEqual([
    hmpbP1Qrcode,
    hmpbP2Qrcode,
  ])
  expect(inferMissingQrcode(election, [undefined, hmpbP1Qrcode])).toEqual([
    hmpbP2Qrcode,
    hmpbP1Qrcode,
  ])
  expect(inferMissingQrcode(election, [hmpbP2Qrcode, undefined])).toEqual([
    hmpbP2Qrcode,
    hmpbP1Qrcode,
  ])
  expect(inferMissingQrcode(election, [undefined, hmpbP2Qrcode])).toEqual([
    hmpbP1Qrcode,
    hmpbP2Qrcode,
  ])
})

test('infers a missing QR code by assuming the page orientation is the same for both sides', async () => {
  expect(
    inferMissingQrcode(election, [
      { ...hmpbP1Qrcode, position: 'bottom' },
      undefined,
    ])
  ).toEqual([
    { ...hmpbP1Qrcode, position: 'bottom' },
    { ...hmpbP2Qrcode, position: 'bottom' },
  ])
  expect(
    inferMissingQrcode(election, [
      { ...hmpbP1Qrcode, position: 'top' },
      undefined,
    ])
  ).toEqual([
    { ...hmpbP1Qrcode, position: 'top' },
    { ...hmpbP2Qrcode, position: 'top' },
  ])
})
