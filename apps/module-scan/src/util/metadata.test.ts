import {
  BallotType,
  electionDefinitionSample as electionDefinition,
  v1,
} from '@votingworks/ballot-encoder'
import { BallotPageMetadata } from '@votingworks/hmpb-interpreter'
import { BallotMetadata, BallotPageQrcode } from '../types'
import { normalizeSheetMetadata } from './metadata'

const { election, electionHash } = electionDefinition

test('normalizing sheet metadata', () => {
  const metadata: BallotMetadata = {
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    ballotType: BallotType.Standard,
    electionHash,
    isTestMode: false,
    locales: { primary: 'en-US' },
  }
  const frontHmpbMetadata: BallotPageMetadata = {
    ...metadata,
    pageNumber: 1,
  }
  const backHmpbMetadata: BallotPageMetadata = {
    ...metadata,
    pageNumber: 2,
  }
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
  const frontHmpbQrcode: BallotPageQrcode = {
    data: v1.encodeHMPBBallotPageMetadata(election, frontHmpbMetadata),
    position: 'bottom',
  }
  const backHmpbQrcode: BallotPageQrcode = {
    data: v1.encodeHMPBBallotPageMetadata(election, backHmpbMetadata),
    position: 'bottom',
  }

  // front HMPB / back HMPB
  expect(
    normalizeSheetMetadata(election, [frontHmpbQrcode, backHmpbQrcode])
  ).toEqual([frontHmpbQrcode, backHmpbQrcode])

  // front HMPB / back missing
  expect(
    normalizeSheetMetadata(election, [frontHmpbQrcode, undefined])
  ).toEqual([frontHmpbQrcode, backHmpbQrcode])

  // front missing / back rotated HMPB
  expect(
    normalizeSheetMetadata(election, [
      undefined,
      { ...backHmpbQrcode, position: 'top' },
    ])
  ).toEqual([
    { ...frontHmpbQrcode, position: 'top' },
    { ...backHmpbQrcode, position: 'top' },
  ])

  // front rotated HMPB / back missing
  expect(
    normalizeSheetMetadata(election, [
      { ...backHmpbQrcode, position: 'top' },
      undefined,
    ])
  ).toEqual([
    { ...backHmpbQrcode, position: 'top' },
    { ...frontHmpbQrcode, position: 'top' },
  ])

  // front missing / back HMPB
  expect(
    normalizeSheetMetadata(election, [undefined, backHmpbQrcode])
  ).toEqual([frontHmpbQrcode, backHmpbQrcode])

  // front missing / back missing
  expect(normalizeSheetMetadata(election, [undefined, undefined])).toEqual([
    undefined,
    undefined,
  ])

  // front BMD / back missing
  expect(normalizeSheetMetadata(election, [bmdQrcode, undefined])).toEqual([
    bmdQrcode,
    undefined,
  ])

  // front missing / back BMD
  expect(normalizeSheetMetadata(election, [undefined, bmdQrcode])).toEqual([
    undefined,
    bmdQrcode,
  ])

  // front rotated BMD / back missing
  expect(
    normalizeSheetMetadata(election, [
      { ...bmdQrcode, position: 'bottom' },
      undefined,
    ])
  ).toEqual([{ ...bmdQrcode, position: 'bottom' }, undefined])

  // front rotated BMD / back missing
  expect(
    normalizeSheetMetadata(election, [
      undefined,
      { ...bmdQrcode, position: 'bottom' },
    ])
  ).toEqual([undefined, { ...bmdQrcode, position: 'bottom' }])
})
