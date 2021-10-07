import {
  CandidateContest,
  CastVoteRecord,
  ContestOptionTally,
  Dictionary,
  expandEitherNeitherContests,
  VotingMethod,
  writeInCandidate,
} from '@votingworks/types'
import { strict as assert } from 'assert'
import {
  electionMultiPartyPrimaryWithDataFiles,
  electionSampleDefinition,
  electionWithMsEitherNeitherWithDataFiles,
} from '@votingworks/fixtures'
import { getZeroCompressedTally } from '@votingworks/test-utils'

import { compressTally, readCompressedTally } from './compressedTallies'

import { calculateTallyForCastVoteRecords } from './votes'
import { find } from './find'

describe('compressTally', () => {
  test('compressTally returns empty tally when no contest tallies provided', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherWithDataFiles.electionDefinition.election
    const emptyTally = {
      numberOfBallotsCounted: 0,
      castVoteRecords: new Set<CastVoteRecord>(),
      contestTallies: {},
      ballotCountsByVotingMethod: {},
    }
    const compressedTally = compressTally(electionEitherNeither, emptyTally)
    // There should be a compressed tally for each contest
    expect(compressedTally.length).toBe(electionEitherNeither.contests.length)
    // A candidate contest compressed tally should be all zeros
    expect(compressedTally[0]).toStrictEqual([0, 0, 0, 0, 0, 0, 0])

    // A yes no contest compressed tally should be all zeros
    const yesNoContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000017'
    )
    expect(compressedTally[yesNoContestIdx]).toStrictEqual([0, 0, 0, 0, 0])

    // An either neither contest compressed tally should be all zeros
    const eitherNeitherContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000015-either-neither'
    )
    expect(compressedTally[eitherNeitherContestIdx]).toStrictEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ])
  })
  test('compressTally compresses a candidate tally properly', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherWithDataFiles.electionDefinition.election
    const emptyTally = calculateTallyForCastVoteRecords(
      electionEitherNeither,
      new Set()
    )
    const presidentContest = find(
      electionEitherNeither.contests,
      (c): c is CandidateContest =>
        c.type === 'candidate' && c.id === '775020876'
    )
    const candidateTallies: Dictionary<ContestOptionTally> = {}
    presidentContest.candidates.forEach((candidate, idx) => {
      candidateTallies[candidate.id] = {
        option: candidate,
        tally: idx * 2,
      }
    })
    candidateTallies[writeInCandidate.id] = {
      option: writeInCandidate,
      tally: 5,
    }
    const tallyWithPresidentTallies = {
      ...emptyTally,
      contestTallies: {
        ...emptyTally.contestTallies,
        '775020876': {
          contest: presidentContest,
          tallies: candidateTallies,
          metadata: {
            undervotes: 5,
            overvotes: 4,
            ballots: 20,
          },
        },
      },
    }
    const compressedTally = compressTally(
      electionEitherNeither,
      tallyWithPresidentTallies
    )
    expect(compressedTally).toHaveLength(electionEitherNeither.contests.length)
    expect(compressedTally[0]).toStrictEqual([5, 4, 20, 0, 2, 4, 5])
  })

  test('compressTally compresses a yes no tally properly', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherWithDataFiles.electionDefinition.election
    const emptyTally = calculateTallyForCastVoteRecords(
      electionEitherNeither,
      new Set()
    )
    const yesNoContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000017'
    )
    const yesNoContest = electionEitherNeither.contests[yesNoContestIdx]
    assert(yesNoContest?.type === 'yesno')
    const optionTallies: Dictionary<ContestOptionTally> = {
      yes: { option: ['yes'], tally: 7 },
      no: { option: ['no'], tally: 9 },
    }
    const tallyWithYesNoTallies = {
      ...emptyTally,
      contestTallies: {
        ...emptyTally.contestTallies,
        '750000017': {
          contest: yesNoContest,
          tallies: optionTallies,
          metadata: {
            undervotes: 1,
            overvotes: 3,
            ballots: 20,
          },
        },
      },
    }
    const compressedTally = compressTally(
      electionEitherNeither,
      tallyWithYesNoTallies
    )
    expect(compressedTally).toHaveLength(electionEitherNeither.contests.length)
    expect(compressedTally[yesNoContestIdx]).toStrictEqual([1, 3, 20, 7, 9])
  })

  test('compressTally compresses an either neither tally properly', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherWithDataFiles.electionDefinition.election
    const emptyTally = calculateTallyForCastVoteRecords(
      electionEitherNeither,
      new Set()
    )
    const eitherNeitherContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000015-either-neither'
    )
    const eitherNeitherContest =
      electionEitherNeither.contests[eitherNeitherContestIdx]
    assert(eitherNeitherContest)
    const [eitherNeither, pickOne] = expandEitherNeitherContests([
      eitherNeitherContest,
    ])
    assert(eitherNeither?.type === 'yesno')
    assert(pickOne?.type === 'yesno')
    const optionTallies1: Dictionary<ContestOptionTally> = {
      yes: { option: ['yes'], tally: 1 },
      no: { option: ['no'], tally: 3 },
    }
    const optionTallies2: Dictionary<ContestOptionTally> = {
      yes: { option: ['yes'], tally: 3 },
      no: { option: ['no'], tally: 1 },
    }
    const tallyWithEitherNeitherTallies = {
      ...emptyTally,
      contestTallies: {
        ...emptyTally.contestTallies,
        [eitherNeither.id]: {
          contest: eitherNeither,
          tallies: optionTallies1,
          metadata: {
            undervotes: 2,
            overvotes: 2,
            ballots: 8,
          },
        },
        [pickOne.id]: {
          contest: pickOne,
          tallies: optionTallies2,
          metadata: {
            undervotes: 0,
            overvotes: 4,
            ballots: 8,
          },
        },
      },
    }
    const compressedTally = compressTally(
      electionEitherNeither,
      tallyWithEitherNeitherTallies
    )
    expect(compressedTally).toHaveLength(electionEitherNeither.contests.length)
    expect(compressedTally[eitherNeitherContestIdx]).toStrictEqual([
      1, 3, 2, 2, 3, 1, 0, 4, 8,
    ])
  })
})

describe('readCompressTally', () => {
  test('reads a empty tally as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherWithDataFiles.electionDefinition.election
    const zeroTally = getZeroCompressedTally(electionEitherNeither)
    const tally = readCompressedTally(electionEitherNeither, zeroTally, 0, {})
    expect(tally.numberOfBallotsCounted).toBe(0)
    // Check that all tallies are 0
    for (const contestTally of Object.values(tally.contestTallies)) {
      assert(contestTally)
      expect(contestTally.metadata).toStrictEqual({
        ballots: 0,
        undervotes: 0,
        overvotes: 0,
      })
      for (const optionTally of Object.values(contestTally.tallies)) {
        assert(optionTally)
        expect(optionTally.tally).toBe(0)
      }
    }

    // Check that all other data in the tally was constructed properly.
    const expectedEmptyTally = calculateTallyForCastVoteRecords(
      electionEitherNeither,
      new Set()
    )
    expect(tally.contestTallies).toStrictEqual(
      expectedEmptyTally.contestTallies
    )
  })

  test('reads a candidate tally with write ins as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherWithDataFiles.electionDefinition.election
    const compressedTally = getZeroCompressedTally(electionEitherNeither)
    compressedTally[0] = [5, 4, 20, 0, 2, 4, 5]
    const presidentContest = electionEitherNeither.contests.find(
      (contest) => contest.id === '775020876'
    )
    assert(presidentContest?.type === 'candidate')
    const votingMethodData = {
      [VotingMethod.Absentee]: 5,
      [VotingMethod.Precinct]: 15,
    }
    const tally = readCompressedTally(
      electionEitherNeither,
      compressedTally,
      20,
      votingMethodData
    )
    expect(tally.numberOfBallotsCounted).toBe(20)
    expect(tally.ballotCountsByVotingMethod).toBe(votingMethodData)
    const presidentTally = tally.contestTallies['775020876']
    assert(presidentTally)
    expect(presidentTally.contest).toBe(presidentContest)
    expect(presidentTally.metadata).toStrictEqual({
      ballots: 20,
      undervotes: 5,
      overvotes: 4,
    })
    expect(Object.keys(presidentTally.tallies)).toHaveLength(
      presidentContest.candidates.length + 1
    ) // 1 more then the number of candidates to include write ins
    expect(presidentTally.tallies['775031988']).toStrictEqual({
      option: presidentContest.candidates.find((c) => c.id === '775031988'),
      tally: 0,
    })
    expect(presidentTally.tallies['775031987']).toStrictEqual({
      option: presidentContest.candidates.find((c) => c.id === '775031987'),
      tally: 2,
    })
    expect(presidentTally.tallies['775031989']).toStrictEqual({
      option: presidentContest.candidates.find((c) => c.id === '775031989'),
      tally: 4,
    })
    expect(presidentTally.tallies[writeInCandidate.id]).toStrictEqual({
      option: writeInCandidate,
      tally: 5,
    })
  })

  test('reads a candidate tally without write ins as expected', () => {
    const compressedTally = getZeroCompressedTally(
      electionSampleDefinition.election
    )
    compressedTally[0] = [5, 4, 20, 3, 2, 2, 1, 1, 2, 50]
    const presidentContest = electionSampleDefinition.election.contests.find(
      (contest) => contest.id === 'president'
    )
    assert(presidentContest?.type === 'candidate')
    const votingMethodData = {
      [VotingMethod.Absentee]: 5,
      [VotingMethod.Precinct]: 15,
    }
    const tally = readCompressedTally(
      electionSampleDefinition.election,
      compressedTally,
      20,
      votingMethodData
    )
    expect(tally.numberOfBallotsCounted).toBe(20)
    expect(tally.ballotCountsByVotingMethod).toBe(votingMethodData)
    const presidentTally = tally.contestTallies.president
    assert(presidentTally)
    expect(presidentTally.contest).toBe(presidentContest)
    expect(presidentTally.metadata).toStrictEqual({
      ballots: 20,
      undervotes: 5,
      overvotes: 4,
    })
    expect(Object.keys(presidentTally.tallies)).toHaveLength(
      presidentContest.candidates.length
    )
    expect(presidentTally.tallies['barchi-hallaren']).toStrictEqual({
      option: presidentContest.candidates.find(
        (c) => c.id === 'barchi-hallaren'
      ),
      tally: 3,
    })
    expect(presidentTally.tallies['cramer-vuocolo']).toStrictEqual({
      option: presidentContest.candidates.find(
        (c) => c.id === 'cramer-vuocolo'
      ),
      tally: 2,
    })
    expect(presidentTally.tallies['court-blumhardt']).toStrictEqual({
      option: presidentContest.candidates.find(
        (c) => c.id === 'court-blumhardt'
      ),
      tally: 2,
    })
    expect(presidentTally.tallies['boone-lian']).toStrictEqual({
      option: presidentContest.candidates.find((c) => c.id === 'boone-lian'),
      tally: 1,
    })
    expect(presidentTally.tallies['hildebrand-garritty']).toStrictEqual({
      option: presidentContest.candidates.find(
        (c) => c.id === 'hildebrand-garritty'
      ),
      tally: 1,
    })
    expect(presidentTally.tallies['patterson-lariviere']).toStrictEqual({
      option: presidentContest.candidates.find(
        (c) => c.id === 'patterson-lariviere'
      ),
      tally: 2,
    })
    expect(Object.keys(presidentTally.tallies)).not.toContain(
      writeInCandidate.id
    )
  })

  test('reads a yes no tally as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherWithDataFiles.electionDefinition.election
    const compressedTally = getZeroCompressedTally(electionEitherNeither)
    const yesNoContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000017'
    )
    compressedTally[yesNoContestIdx] = [6, 4, 20, 3, 7]
    const yesNoContest = electionEitherNeither.contests[yesNoContestIdx]
    assert(yesNoContest?.type === 'yesno')
    const votingMethodData = {
      [VotingMethod.Absentee]: 15,
      [VotingMethod.Precinct]: 5,
    }
    const tally = readCompressedTally(
      electionEitherNeither,
      compressedTally,
      20,
      votingMethodData
    )
    expect(tally.numberOfBallotsCounted).toBe(20)
    expect(tally.ballotCountsByVotingMethod).toBe(votingMethodData)
    const yesNoTally = tally.contestTallies['750000017']
    assert(yesNoTally)
    expect(yesNoTally.contest).toBe(yesNoContest)
    expect(yesNoTally.metadata).toStrictEqual({
      ballots: 20,
      undervotes: 6,
      overvotes: 4,
    })
    expect(yesNoTally.tallies).toStrictEqual({
      yes: { option: ['yes'], tally: 3 },
      no: { option: ['no'], tally: 7 },
    })
  })

  test('reads an either neither tally as expected', () => {
    const electionEitherNeither =
      electionWithMsEitherNeitherWithDataFiles.electionDefinition.election
    const compressedTally = getZeroCompressedTally(electionEitherNeither)
    const eitherNeitherContestIdx = electionEitherNeither.contests.findIndex(
      (contest) => contest.id === '750000015-either-neither'
    )
    compressedTally[eitherNeitherContestIdx] = [3, 7, 2, 3, 6, 4, 4, 1, 15]
    const eitherNeitherContest =
      electionEitherNeither.contests[eitherNeitherContestIdx]
    assert(eitherNeitherContest)
    const [eitherNeither, pickOne] = expandEitherNeitherContests([
      eitherNeitherContest,
    ])
    assert(eitherNeither?.type === 'yesno')
    assert(pickOne?.type === 'yesno')
    const votingMethodData = {
      [VotingMethod.Absentee]: 8,
      [VotingMethod.Precinct]: 7,
    }
    const tally = readCompressedTally(
      electionEitherNeither,
      compressedTally,
      15,
      votingMethodData
    )
    expect(tally.numberOfBallotsCounted).toBe(15)
    expect(tally.ballotCountsByVotingMethod).toBe(votingMethodData)
    const eitherNeitherTally = tally.contestTallies[eitherNeither.id]
    const pickOneTally = tally.contestTallies[pickOne.id]
    assert(eitherNeitherTally)
    expect(eitherNeitherTally.contest).toStrictEqual(eitherNeither)
    expect(eitherNeitherTally.metadata).toStrictEqual({
      ballots: 15,
      undervotes: 2,
      overvotes: 3,
    })
    expect(eitherNeitherTally.tallies).toStrictEqual({
      yes: { option: ['yes'], tally: 3 },
      no: { option: ['no'], tally: 7 },
    })
    assert(pickOneTally)
    expect(pickOneTally.contest).toStrictEqual(pickOne)
    expect(pickOneTally.metadata).toStrictEqual({
      ballots: 15,
      undervotes: 4,
      overvotes: 1,
    })
    expect(pickOneTally.tallies).toStrictEqual({
      yes: { option: ['yes'], tally: 6 },
      no: { option: ['no'], tally: 4 },
    })
  })
})

test('either neither tally can compress and be read back and end with the original tally', () => {
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
  const compressedTally = compressTally(electionEitherNeither, expectedTally)
  const processedCompressedTally = readCompressedTally(
    electionEitherNeither,
    compressedTally,
    expectedTally.numberOfBallotsCounted,
    expectedTally.ballotCountsByVotingMethod
  )
  expect(processedCompressedTally.ballotCountsByVotingMethod).toStrictEqual(
    expectedTally.ballotCountsByVotingMethod
  )
  expect(processedCompressedTally.numberOfBallotsCounted).toStrictEqual(
    expectedTally.numberOfBallotsCounted
  )
  expect(processedCompressedTally.contestTallies).toStrictEqual(
    expectedTally.contestTallies
  )
})

test('multi party primary tally can compress and be read back and end with the original tally', () => {
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
  const compressedTally = compressTally(electionMultiParty, expectedTally)
  const processedCompressedTally = readCompressedTally(
    electionMultiParty,
    compressedTally,
    expectedTally.numberOfBallotsCounted,
    expectedTally.ballotCountsByVotingMethod
  )
  expect(processedCompressedTally.ballotCountsByVotingMethod).toStrictEqual(
    expectedTally.ballotCountsByVotingMethod
  )
  expect(processedCompressedTally.numberOfBallotsCounted).toStrictEqual(
    expectedTally.numberOfBallotsCounted
  )
  expect(processedCompressedTally.contestTallies).toStrictEqual(
    expectedTally.contestTallies
  )
})
