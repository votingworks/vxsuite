import {
  electionMultiPartyPrimaryWithDataFiles,
  electionWithMsEitherNeitherWithDataFiles,
} from '@votingworks/fixtures'
import {
  CandidateContest,
  Dictionary,
  Election,
  YesNoContest,
} from '@votingworks/types'
import {
  CastVoteRecord,
  ContestOptionTally,
  ExportableTallies,
  VotingMethod,
} from '../config/types'
import { computeFullElectionTally, parseCVRs } from '../lib/votecounting'
import { writeInCandidate } from './election'
import {
  getCombinedExportableContestTally,
  getExportableTallies,
} from './exportableTallies'
import { convertSEMSFileToExternalTally } from './semsTallies'

const multiPartyPrimaryElection =
  electionMultiPartyPrimaryWithDataFiles.electionDefinition.election
const electionWithMsEitherNeither =
  electionWithMsEitherNeitherWithDataFiles.electionDefinition.election

const yesnocontest = electionWithMsEitherNeither.contests.find(
  (c) => c.id === '750000017'
) as YesNoContest
const presidentcontest = electionWithMsEitherNeither.contests.find(
  (c) => c.id === '775020876'
) as CandidateContest

function parseCVRsAndAssertSuccess(
  cvrsFileContents: string,
  election: Election
): CastVoteRecord[] {
  return [...parseCVRs(cvrsFileContents, election)].map(({ cvr, errors }) => {
    expect({ cvr, errors }).toEqual({ cvr, errors: [] })
    return cvr
  })
}

function assertTalliesAreIdenticalMultiples(
  baseTally: ExportableTallies,
  multipleTally: ExportableTallies,
  multiplier: number
): void {
  // Both tallies should have the same precincts defined
  expect(Object.keys(baseTally.talliesByPrecinct)).toEqual(
    Object.keys(multipleTally.talliesByPrecinct)
  )
  for (const precinctId of Object.keys(baseTally.talliesByPrecinct)) {
    expect(precinctId in multipleTally.talliesByPrecinct)
    const baseForPrecinct = baseTally.talliesByPrecinct[precinctId]
    const multipleForPrecinct = multipleTally.talliesByPrecinct[precinctId]
    // Both tallies should have the same contests defined
    expect(Object.keys(baseForPrecinct!)).toEqual(
      Object.keys(multipleForPrecinct!)
    )
    for (const contestId of Object.keys(baseForPrecinct!)) {
      expect(contestId in multipleForPrecinct!)
      const baseContestTally = baseForPrecinct![contestId]!
      const multipleContestTally = multipleForPrecinct![contestId]!
      // Metadata should be mulitiplied
      expect(multipleContestTally.metadata).toEqual({
        ballots: baseContestTally.metadata.ballots * multiplier,
        overvotes: baseContestTally.metadata.overvotes * multiplier,
        undervotes: baseContestTally.metadata.undervotes * multiplier,
      })

      // Both tallies should have the same candidates defined
      expect(Object.keys(baseContestTally.tallies)).toEqual(
        Object.keys(multipleContestTally.tallies)
      )

      for (const optionId of Object.keys(baseContestTally.tallies)) {
        // Candidate/yes/no tallies should be multipled
        expect(multipleContestTally.tallies[optionId]!).toEqual(
          multiplier * baseContestTally.tallies[optionId]!
        )
      }
    }
  }
}

describe('getCombinedExportableContestTally', () => {
  it('combines yes no contests as expected', () => {
    const emptyExportable = {
      tallies: {},
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    }
    const emptyContestTally = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 0 },
        no: { option: ['no'], tally: 0 },
      } as Dictionary<ContestOptionTally>,
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    }
    expect(
      getCombinedExportableContestTally(emptyExportable, emptyContestTally)
    ).toEqual({
      tallies: {
        yes: 0,
        no: 0,
      },
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    })

    const populatedContestTally = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 3 },
        no: { option: ['no'], tally: 4 },
      } as Dictionary<ContestOptionTally>,
      metadata: { ballots: 18, undervotes: 5, overvotes: 6 },
    }
    const results = getCombinedExportableContestTally(
      emptyExportable,
      populatedContestTally
    )
    expect(results).toEqual({
      tallies: {
        yes: 3,
        no: 4,
      },
      metadata: { ballots: 18, undervotes: 5, overvotes: 6 },
    })
    expect(
      getCombinedExportableContestTally(results, populatedContestTally)
    ).toEqual({
      tallies: {
        yes: 6,
        no: 8,
      },
      metadata: { ballots: 36, undervotes: 10, overvotes: 12 },
    })
  })

  it('combines candidate contests as expected', () => {
    const emptyExportable = {
      tallies: {},
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    }
    const emptyContestTally = {
      contest: presidentcontest,
      tallies: {
        775031988: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031988'
          )!,
          tally: 0,
        },
        775031989: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031989'
          )!,
          tally: 0,
        },
      } as Dictionary<ContestOptionTally>,
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    }

    expect(
      getCombinedExportableContestTally(emptyExportable, emptyContestTally)
    ).toEqual({
      tallies: {
        '775031988': 0,
        '775031989': 0,
      },
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    })

    const partialContestTally = {
      contest: presidentcontest,
      tallies: {
        775031988: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031988'
          )!,
          tally: 12,
        },
        775031989: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031989'
          )!,
          tally: 8,
        },
      } as Dictionary<ContestOptionTally>,
      metadata: { ballots: 30, undervotes: 6, overvotes: 4 },
    }
    const partialResult = getCombinedExportableContestTally(
      emptyExportable,
      partialContestTally
    )
    expect(partialResult).toEqual({
      tallies: {
        775031988: 12,
        775031989: 8,
      },
      metadata: { ballots: 30, undervotes: 6, overvotes: 4 },
    })

    const tallyForEveryone = {
      contest: presidentcontest,
      tallies: {
        775031988: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031988'
          )!,
          tally: 8,
        },
        775031989: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031989'
          )!,
          tally: 12,
        },
        775031987: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031987'
          )!,
          tally: 10,
        },
        '__write-in': {
          option: writeInCandidate,
          tally: 10,
        },
      } as Dictionary<ContestOptionTally>,
      metadata: { ballots: 40, undervotes: 4, overvotes: 6 },
    }

    expect(
      getCombinedExportableContestTally(partialResult, tallyForEveryone)
    ).toEqual({
      tallies: {
        775031988: 20,
        775031989: 20,
        775031987: 10,
        '__write-in': 10,
      },
      metadata: { ballots: 70, undervotes: 10, overvotes: 10 },
    })
  })
})

describe('getExportableTallies', () => {
  it('builds expected tally object for election with either neither with just internal data', () => {
    const castVoteRecords = parseCVRsAndAssertSuccess(
      electionWithMsEitherNeitherWithDataFiles.cvrData,
      electionWithMsEitherNeither
    )
    const fullInternalTally = computeFullElectionTally(
      electionWithMsEitherNeither,
      [castVoteRecords]
    )
    const tally = getExportableTallies(
      fullInternalTally,
      [],
      electionWithMsEitherNeither
    )
    expect(tally).toMatchSnapshot()
  })

  it('builds expected tally object for election with either neither with external and internal data', () => {
    const castVoteRecords = parseCVRsAndAssertSuccess(
      electionWithMsEitherNeitherWithDataFiles.cvrData,
      electionWithMsEitherNeither
    )
    const fullInternalTally = computeFullElectionTally(
      electionWithMsEitherNeither,
      [castVoteRecords]
    )
    const fullExternalTally = convertSEMSFileToExternalTally(
      electionWithMsEitherNeitherWithDataFiles.semsData,
      electionWithMsEitherNeither,
      VotingMethod.Precinct,
      'file-name',
      new Date()
    )
    // Get tally with just CVR data
    const baseTally = getExportableTallies(
      fullInternalTally,
      [],
      electionWithMsEitherNeither
    )
    // Get tally with CVR and SEMS data
    const doubleTally = getExportableTallies(
      fullInternalTally,
      [fullExternalTally],
      electionWithMsEitherNeither
    )

    // doubleTally should be exactly 2 times everything in baseTally
    assertTalliesAreIdenticalMultiples(baseTally, doubleTally, 2)
    // Get tally with SEMS data duplicated 3x
    const quadrupleTally = getExportableTallies(
      fullInternalTally,
      [fullExternalTally, fullExternalTally, fullExternalTally],
      electionWithMsEitherNeither
    )
    // quadrupleTally should be exactly 4 times everyhting in baseTally
    assertTalliesAreIdenticalMultiples(baseTally, quadrupleTally, 4)
  })

  it('builds expected tally object for primary election with just internal data', () => {
    const castVoteRecords = parseCVRsAndAssertSuccess(
      electionMultiPartyPrimaryWithDataFiles.cvrData,
      multiPartyPrimaryElection
    )
    const fullInternalTally = computeFullElectionTally(
      multiPartyPrimaryElection,
      [castVoteRecords]
    )
    const tally = getExportableTallies(
      fullInternalTally,
      [],
      multiPartyPrimaryElection
    )
    expect(tally).toMatchSnapshot()
  })

  it('builds expected tally object for primary election with external and internal data', () => {
    const castVoteRecords = parseCVRsAndAssertSuccess(
      electionMultiPartyPrimaryWithDataFiles.cvrData,
      multiPartyPrimaryElection
    )
    const fullInternalTally = computeFullElectionTally(
      multiPartyPrimaryElection,
      [castVoteRecords]
    )
    const fullExternalTally = convertSEMSFileToExternalTally(
      electionMultiPartyPrimaryWithDataFiles.semsData,
      multiPartyPrimaryElection,
      VotingMethod.Precinct,
      'file-name',
      new Date()
    )
    // Get tally with just CVR data
    const baseTally = getExportableTallies(
      fullInternalTally,
      [],
      multiPartyPrimaryElection
    )
    // Get tally with CVR and SEMS data
    const doubleTally = getExportableTallies(
      fullInternalTally,
      [fullExternalTally],
      multiPartyPrimaryElection
    )

    // doubleTally should be exactly 2 times everything in baseTally
    assertTalliesAreIdenticalMultiples(baseTally, doubleTally, 2)
    // Get tally with SEMS data duplicated 3x
    const quadrupleTally = getExportableTallies(
      fullInternalTally,
      [fullExternalTally, fullExternalTally, fullExternalTally],
      multiPartyPrimaryElection
    )
    // quadrupleTally should be exactly 4 times everyhting in baseTally
    assertTalliesAreIdenticalMultiples(baseTally, quadrupleTally, 4)
  })
})
