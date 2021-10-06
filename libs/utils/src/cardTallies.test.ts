import { CastVoteRecord } from '@votingworks/types'
import {
  electionMultiPartyPrimaryWithDataFiles,
  electionWithMsEitherNeitherWithDataFiles,
} from '@votingworks/fixtures'

import { serializeTally, readSerializedTally } from './cardTallies'

import { calculateTallyForCastVoteRecords } from './votes'

test('readSerializedTally converts back to the expected tallies for either neither', () => {
  const castVoteRecordsContent =
    electionWithMsEitherNeitherWithDataFiles.cvrData
  const lines = castVoteRecordsContent.split('\n')
  const castVoteRecords = lines.flatMap((line) =>
    line.length > 0 ? (JSON.parse(line) as CastVoteRecord) : []
  )
  const electionEitherNeither =
    electionWithMsEitherNeitherWithDataFiles.electionDefinition.election

  const expectedTally = calculateTallyForCastVoteRecords(
    electionEitherNeither,
    new Set(castVoteRecords)
  )
  const serializedTally = serializeTally(electionEitherNeither, expectedTally)
  const processedSerializedTally = readSerializedTally(
    electionEitherNeither,
    serializedTally,
    expectedTally.numberOfBallotsCounted,
    expectedTally.ballotCountsByVotingMethod
  )
  expect(processedSerializedTally.ballotCountsByVotingMethod).toStrictEqual(
    expectedTally.ballotCountsByVotingMethod
  )
  expect(processedSerializedTally.numberOfBallotsCounted).toStrictEqual(
    expectedTally.numberOfBallotsCounted
  )
  expect(processedSerializedTally.contestTallies).toStrictEqual(
    expectedTally.contestTallies
  )
})

test('readSerializedTally converts back to the expected tallies for primary', () => {
  const castVoteRecordsContent = electionMultiPartyPrimaryWithDataFiles.cvrData
  const lines = castVoteRecordsContent.split('\n')
  const castVoteRecords = lines.flatMap((line) =>
    line.length > 0 ? (JSON.parse(line) as CastVoteRecord) : []
  )
  const electionMultiParty =
    electionMultiPartyPrimaryWithDataFiles.electionDefinition.election

  const expectedTally = calculateTallyForCastVoteRecords(
    electionMultiParty,
    new Set(castVoteRecords)
  )
  const serializedTally = serializeTally(electionMultiParty, expectedTally)
  const processedSerializedTally = readSerializedTally(
    electionMultiParty,
    serializedTally,
    expectedTally.numberOfBallotsCounted,
    expectedTally.ballotCountsByVotingMethod
  )
  expect(processedSerializedTally.ballotCountsByVotingMethod).toStrictEqual(
    expectedTally.ballotCountsByVotingMethod
  )
  expect(processedSerializedTally.numberOfBallotsCounted).toStrictEqual(
    expectedTally.numberOfBallotsCounted
  )
  expect(processedSerializedTally.contestTallies).toStrictEqual(
    expectedTally.contestTallies
  )
})
