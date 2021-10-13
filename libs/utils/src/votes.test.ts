import {
  electionSample,
  electionWithMsEitherNeither,
} from '@votingworks/fixtures'
import {
  BallotStyle,
  CandidateContest,
  CastVoteRecord,
  Party,
  YesNoContest,
} from '@votingworks/types'
import { strict as assert } from 'assert'
import { find } from './find'
import {
  getSingleYesNoVote,
  normalizeWriteInId,
  writeInCandidate,
  buildVoteFromCvr,
  getContestVoteOptionsForYesNoContest,
  getContestVoteOptionsForCandidateContest,
  tallyVotesByContest,
} from './votes'

test('getContestVoteOptionsForYesNoContest', () => {
  expect(
    getContestVoteOptionsForYesNoContest(
      find(
        electionWithMsEitherNeither.contests,
        (c): c is YesNoContest => c.type === 'yesno'
      )
    )
  ).toEqual(['yes', 'no'])
})

test('getContestVoteOptionsForCandidateContest', () => {
  const contestWithWriteIns = find(
    electionSample.contests,
    (c): c is CandidateContest => c.type === 'candidate' && c.allowWriteIns
  )
  const contestWithoutWriteIns = find(
    electionSample.contests,
    (c): c is CandidateContest => c.type === 'candidate' && !c.allowWriteIns
  )
  expect(
    getContestVoteOptionsForCandidateContest(contestWithWriteIns)
  ).toHaveLength(contestWithWriteIns.candidates.length + 1)
  expect(
    getContestVoteOptionsForCandidateContest(contestWithoutWriteIns)
  ).toHaveLength(contestWithoutWriteIns.candidates.length)
})

test('getSingleYesNoVote', () => {
  expect(getSingleYesNoVote()).toBe(undefined)
  expect(getSingleYesNoVote([])).toBe(undefined)
  expect(getSingleYesNoVote(['yes'])).toBe('yes')
  expect(getSingleYesNoVote(['no'])).toBe('no')
  expect(getSingleYesNoVote(['yes', 'no'])).toBe(undefined)
})

test('normalizeWriteInId', () => {
  expect(normalizeWriteInId('arandomword')).toBe('arandomword')
  expect(normalizeWriteInId('__writein123456')).toBe(writeInCandidate.id)
  expect(normalizeWriteInId('__write-in123456')).toBe(writeInCandidate.id)
  expect(normalizeWriteInId('writein123456')).toBe(writeInCandidate.id)
  expect(normalizeWriteInId('write-in123456')).toBe(writeInCandidate.id)
})

test('buildVoteFromCvr', () => {
  const castVoteRecord: CastVoteRecord = {
    '750000015': ['yes'],
    '750000016': [],
    '750000017': ['no'],
    '750000018': ['yes'],
    '775020870': ['775031993'],
    '775020872': ['775031979'],
    '775020876': ['775031989'],
    '775020877': ['775031985'],
    '775020902': ['775032019'],
    _precinctId: '6525',
    _ballotType: 'absentee',
    _ballotStyleId: '1',
    _ballotId: 'b75FfAaktS5jbityDpkFag==',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    _testBallot: false,
    _scannerId: 'scanner-6',
    _pageNumber: 1,
    _locales: { primary: 'en-US' },
  }
  expect(
    buildVoteFromCvr({
      election: electionWithMsEitherNeither,
      cvr: castVoteRecord,
    })
  ).toMatchInlineSnapshot(`
    Object {
      "750000015": Array [
        "yes",
      ],
      "750000016": Array [],
      "750000017": Array [
        "no",
      ],
      "750000018": Array [
        "yes",
      ],
      "775020870": Array [
        Object {
          "id": "775031993",
          "name": "Percy L. Lynchard",
          "partyId": "12",
        },
      ],
      "775020872": Array [
        Object {
          "id": "775031979",
          "name": "Trent Kelly",
          "partyId": "3",
        },
      ],
      "775020876": Array [
        Object {
          "id": "775031989",
          "name": "Presidential Electors for Phil Collins for President and Bill Parker for Vice President",
          "partyId": "11",
        },
      ],
      "775020877": Array [
        Object {
          "id": "775031985",
          "name": "Mike Espy",
          "partyId": "2",
        },
      ],
      "775020902": Array [
        Object {
          "id": "775032019",
          "name": "Willie Mae Guillory",
        },
      ],
    }
  `)

  // Handles malformed either/neither data as expected.
  const castVoteRecord2: CastVoteRecord = {
    '750000015': ['yes'],
    '750000017': ['no'],
    '750000018': ['yes'],
    '775020870': ['775031993'],
    '775020872': ['775031979'],
    '775020876': ['775031989'],
    '775020877': ['775031985'],
    '775020902': ['775032019'],
    _precinctId: '6525',
    _ballotType: 'absentee',
    _ballotStyleId: '1',
    _ballotId: 'b75FfAaktS5jbityDpkFag==',
    _batchId: '1',
    _batchLabel: 'Batch 1',
    _testBallot: false,
    _scannerId: 'scanner-6',
    _pageNumber: 1,
    _locales: { primary: 'en-US' },
  }
  const votes = buildVoteFromCvr({
    election: electionWithMsEitherNeither,
    cvr: castVoteRecord2,
  })
  expect(votes).not.toHaveProperty('750000015') // The either neither contest should be removed since the pick one result was missing
  expect(votes).not.toHaveProperty('750000016')
})

test('tallyVotesByContest zeroes', () => {
  const contestIds = electionSample.contests.map(({ id }) => id)
  const contestTallies = tallyVotesByContest({
    election: electionSample,
    votes: [],
  })

  for (const [contestId, contestTally] of Object.entries(contestTallies)) {
    expect(contestIds).toContain(contestId)
    assert(contestTally)
    for (const [optionId, optionTally] of Object.entries(
      contestTally.tallies
    )) {
      expect(typeof optionId).toEqual('string')
      expect(optionTally?.tally).toEqual(0)
    }
  }
})

test('tallyVotesByContest filtered by party', () => {
  const ballotStyleWithParty = find(
    electionSample.ballotStyles,
    (bs): bs is BallotStyle & { partyId: Party['id'] } => !!bs.partyId
  )
  const filterContestsByParty = ballotStyleWithParty.partyId
  const contestIds = electionSample.contests
    .filter(({ districtId }) =>
      ballotStyleWithParty.districts.includes(districtId)
    )
    .map(({ id }) => id)
  const contestTallies = tallyVotesByContest({
    election: electionSample,
    votes: [],
    filterContestsByParty,
  })

  for (const [contestId, contestTally] of Object.entries(contestTallies)) {
    expect(contestIds).toContain(contestId)
    assert(contestTally)
    for (const [optionId, optionTally] of Object.entries(
      contestTally.tallies
    )) {
      expect(typeof optionId).toEqual('string')
      expect(optionTally?.tally).toEqual(0)
    }
  }
})
