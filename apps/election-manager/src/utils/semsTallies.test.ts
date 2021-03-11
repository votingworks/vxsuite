import {
  electionSample,
  electionMultiPartyPrimaryInternal,
  electionWithMsEitherNeitherInternal,
} from '@votingworks/fixtures'
import { CandidateContest, YesNoContest } from '@votingworks/types'

import * as path from 'path'
import { promises as fs } from 'fs'

import {
  ContestOptionTally,
  ContestTally,
  Dictionary,
  TallyCategory,
} from '../config/types'
import { writeInCandidate } from './election'
import {
  combineContestTallies,
  getTotalNumberOfBallots,
  getContestTallyForCandidateContest,
  getContestTallyForYesNoContest,
  SEMSFileRow,
  convertSEMSFileToExternalTally,
} from './semsTallies'

const mockSemsRow = {
  countyId: '',
  precinctId: '',
  contestId: '',
  contestTitle: '',
  partyId: '',
  partyName: '',
  candidateId: '',
  candidateName: '',
  candidatePartyId: '',
  candidatePartyName: '',
  numberOfVotes: 0,
}

const multiPartyPrimaryElection =
  electionMultiPartyPrimaryInternal.electionDefinition.election
const electionWithMsEitherNeither =
  electionWithMsEitherNeitherInternal.electionDefinition.election

const eitherNeitherSEMSPath = path.join(
  electionWithMsEitherNeitherInternal.semsDataFolderPath!,
  'standard.csv'
)
const primarySEMSPath = path.join(
  electionMultiPartyPrimaryInternal.semsDataFolderPath!,
  'standard.csv.ts'
)

function buildCandidateTallies(
  multiplier: number,
  contest: CandidateContest
): Dictionary<ContestOptionTally> {
  const results: Dictionary<ContestOptionTally> = {}
  let index = 0
  contest.candidates.forEach((c) => {
    results[c.id] = {
      option: c,
      tally: index * multiplier,
    }
    index += 1
  })
  return results
}

const yesnocontest = electionSample.contests.find(
  (c) => c.id === 'question-a'
) as YesNoContest
const presidentcontest = electionSample.contests.find(
  (c) => c.id === 'president'
) as CandidateContest

describe('combineContestTallies', () => {
  it('combine yes no tallies with an empty tally', () => {
    const tally1 = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 12 },
        no: { option: ['no'], tally: 32 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 3, undervotes: 2, ballots: 49 },
    }
    const tally2 = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 0 },
        no: { option: ['no'], tally: 0 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 0, undervotes: 0, ballots: 0 },
    }
    expect(combineContestTallies(tally1, tally2)).toStrictEqual(tally1)
  })

  it('combine yes no tallies properly', () => {
    const tally1 = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 12 },
        no: { option: ['no'], tally: 32 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 3, undervotes: 2, ballots: 49 },
    }
    const tally2 = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 26 },
        no: { option: ['no'], tally: 32 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 1, undervotes: 4, ballots: 63 },
    }
    expect(combineContestTallies(tally1, tally2)).toStrictEqual({
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 38 },
        no: { option: ['no'], tally: 64 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 4, undervotes: 6, ballots: 112 },
    })
  })

  it('combines candidate tally with empty tally properly', () => {
    const tally1 = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(1, presidentcontest),
      metadata: { overvotes: 3, undervotes: 2, ballots: 20 },
    }
    const tally2 = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(0, presidentcontest),
      metadata: { overvotes: 0, undervotes: 0, ballots: 0 },
    }
    expect(combineContestTallies(tally1, tally2)).toStrictEqual(tally1)
  })

  it('combines candidate tally with empty tally properly', () => {
    const tally1 = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(1, presidentcontest),
      metadata: { overvotes: 3, undervotes: 2, ballots: 20 },
    }
    const tally2 = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(2, presidentcontest),
      metadata: { overvotes: 1, undervotes: 1, ballots: 32 },
    }
    expect(combineContestTallies(tally1, tally2)).toStrictEqual({
      contest: presidentcontest,
      tallies: buildCandidateTallies(3, presidentcontest),
      metadata: { overvotes: 4, undervotes: 3, ballots: 52 },
    })
  })

  it('throws error with mismatched contests', () => {
    const tally1 = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 12 },
        no: { option: ['no'], tally: 32 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 3, undervotes: 2, ballots: 49 },
    }
    const tally2 = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(2, presidentcontest),
      metadata: { overvotes: 1, undervotes: 1, ballots: 32 },
    }
    expect(() => combineContestTallies(tally1, tally2)).toThrow()
  })
})

describe('getTotalNumberOfBallots', () => {
  it('finds correct number of ballots for an election with 1 contest in all ballot styles', () => {
    const tally1 = {
      contest: presidentcontest,
      tallies: {},
      metadata: { overvotes: 0, undervotes: 0, ballots: 53 },
    }
    const tally2 = {
      contest: yesnocontest,
      tallies: {},
      metadata: { overvotes: 0, undervotes: 0, ballots: 37 },
    }
    const contestTallies = {
      president: tally1,
      'question-a': tally2,
    }
    expect(getTotalNumberOfBallots(contestTallies, electionSample)).toBe(53)
  })

  it('finds correct number of ballots for a primary election with disjoint ballot sets', () => {
    const contestTallies: Dictionary<ContestTally> = {}
    // The follow ballot counts per contest determined based on the following number of votes for each ballot style in the election.
    // 1L: 7, 2L: 12, 3C: 32, 4F: 25, 5F: 18, 6F: 21
    const talliesForContest: Dictionary<number> = {
      'governor-contest-liberty': 19,
      'governor-contest-constitution': 32,
      'governor-contest-federalist': 64,
      'mayor-contest-liberty': 7,
      'assistant-mayor-contest-liberty': 7,
      'mayor-contest-constitution': 32,
      'mayor-contest-federalist': 39,
      'chief-pokemon-liberty': 12,
      'chief-pokemon-constitution': 32,
      'chief-pokemon-federalist': 21,
      'schoolboard-liberty': 12,
      'schoolboard-constitution': 32,
      'schoolboard-federalist': 21,
    }
    multiPartyPrimaryElection.contests.forEach((c) => {
      contestTallies[c.id] = {
        contest: c,
        tallies: {},
        metadata: {
          overvotes: 0,
          undervotes: 0,
          ballots: talliesForContest[c.id]!,
        },
      }
    })

    // The total number of ballots is 115, if you sum up the votes for each ballot style
    // 7 + 12 + 32 + 25 + 18 + 21 you get 115 ballots, or the max of the votes in each disjoint
    // set of contests (each of the three primaries) 19 (liberty) + 32 (constitution) + 64 (federalist) = 115
    expect(
      getTotalNumberOfBallots(contestTallies, multiPartyPrimaryElection)
    ).toBe(115)
  })
})

describe('getContestTallyForCandidateContest', () => {
  it('computes ContestTally properly for file rows', () => {
    const rows: SEMSFileRow[] = [
      {
        ...mockSemsRow,
        contestId: 'president',
        candidateId: 'barchi-hallaren',
        numberOfVotes: 0,
      },
      {
        ...mockSemsRow,
        contestId: 'president',
        candidateId: 'cramer-vuocolo',
        numberOfVotes: 1,
      },
      {
        ...mockSemsRow,
        contestId: 'president',
        candidateId: 'court-blumhardt',
        numberOfVotes: 2,
      },
      {
        ...mockSemsRow,
        contestId: 'president',
        candidateId: 'boone-lian',
        numberOfVotes: 3,
      },
      {
        ...mockSemsRow,
        contestId: 'president',
        candidateId: 'hildebrand-garritty',
        numberOfVotes: 4,
      },
      {
        ...mockSemsRow,
        contestId: 'president',
        candidateId: 'patterson-lariviere',
        numberOfVotes: 5,
      },
      {
        ...mockSemsRow,
        contestId: 'president',
        candidateId: '1', // overvotes
        numberOfVotes: 11,
      },
      {
        ...mockSemsRow,
        contestId: 'president',
        candidateId: '2', // undervotes
        numberOfVotes: 7,
      },
    ]
    expect(
      getContestTallyForCandidateContest(presidentcontest, rows)
    ).toStrictEqual({
      contest: presidentcontest,
      tallies: buildCandidateTallies(1, presidentcontest),
      metadata: { undervotes: 7, overvotes: 11, ballots: 33 },
    })
  })

  it('computes ContestTally properly for file rows with multiple write ins', () => {
    const contest = electionSample.contests.find(
      (c) => c.id === 'county-commissioners'
    ) as CandidateContest
    const rows: SEMSFileRow[] = [
      {
        ...mockSemsRow,
        contestId: contest.id,
        candidateId: 'argent',
        numberOfVotes: 3,
      },
      {
        ...mockSemsRow,
        contestId: contest.id,
        candidateId: 'argent',
        numberOfVotes: 5,
      },
      {
        ...mockSemsRow,
        contestId: contest.id,
        candidateId: 'bainbridge',
        numberOfVotes: 12,
      },
      {
        ...mockSemsRow,
        contestId: contest.id,
        candidateId: '1', // overvotes
        numberOfVotes: 12,
      },
      {
        ...mockSemsRow,
        contestId: contest.id,
        candidateId: '2', // undervotes
        numberOfVotes: 13,
      },
      {
        ...mockSemsRow,
        contestId: contest.id,
        candidateId: '0', // write in
        candidateName: 'write-in-1',
        numberOfVotes: 2,
      },

      {
        ...mockSemsRow,
        contestId: contest.id,
        candidateId: '0', // write in
        candidateName: 'write-in-2',
        numberOfVotes: 5,
      },
    ]
    const expectedVotes: Dictionary<number> = { argent: 8, bainbridge: 12 }
    const expectedTallies: Dictionary<ContestOptionTally> = {}
    contest.candidates.forEach((candidate) => {
      if (candidate.id in expectedVotes) {
        expectedTallies[candidate.id] = {
          option: candidate,
          tally: expectedVotes[candidate.id]!,
        }
      }
    })
    expectedTallies['__write-in'] = {
      option: writeInCandidate,
      tally: 7,
    }

    expect(getContestTallyForCandidateContest(contest, rows)).toStrictEqual({
      contest,
      tallies: expectedTallies,
      metadata: { undervotes: 13, overvotes: 12, ballots: 13 },
    })
  })

  it('throws an error when given an unknown candidate id', () => {
    const rows: SEMSFileRow[] = [
      {
        ...mockSemsRow,
        contestId: 'president',
        candidateId: 'eevee',
        numberOfVotes: 314,
      },
    ]
    expect(() => {
      getContestTallyForCandidateContest(presidentcontest, rows)
    }).toThrowError(
      'Imported file has unexpected candidate id eevee for contest president'
    )
  })
})

describe('getContestTallyForYesNoContest', () => {
  const yesnocontest = electionWithMsEitherNeither.contests.find(
    (c) => c.id === '750000018'
  )! as YesNoContest
  it('computes ContestTally properly for file rows', () => {
    const rows: SEMSFileRow[] = [
      {
        ...mockSemsRow,
        contestId: yesnocontest.id,
        candidateId: '750000092',
        numberOfVotes: 17,
      },
      {
        ...mockSemsRow,
        contestId: yesnocontest.id,
        candidateId: '750000093',
        numberOfVotes: 12,
      },
      {
        ...mockSemsRow,
        contestId: yesnocontest.id,
        candidateId: '1', // overvotes
        numberOfVotes: 2,
      },
      {
        ...mockSemsRow,
        contestId: yesnocontest.id,
        candidateId: '2', // undervotes
        numberOfVotes: 4,
      },
    ]
    expect(getContestTallyForYesNoContest(yesnocontest, rows)).toStrictEqual({
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 17 },
        no: { option: ['no'], tally: 12 },
      },
      metadata: { undervotes: 4, overvotes: 2, ballots: 35 },
    })
  })

  it('throws an error on an unexpected contest option id', () => {
    const rows: SEMSFileRow[] = [
      {
        ...mockSemsRow,
        contestId: yesnocontest.id,
        candidateId: 'purple',
        numberOfVotes: 314,
      },
    ]
    expect(() => {
      getContestTallyForYesNoContest(yesnocontest, rows)
    }).toThrowError(
      'Imported file has unexpected option id purple for contest 750000018'
    )
  })
})

describe('convertSEMSFileToExternalTally', () => {
  it('computes tallies properly on either neither general election', async () => {
    const semsFileContent = await fs.readFile(eitherNeitherSEMSPath, 'utf8')
    const convertedTally = convertSEMSFileToExternalTally(
      semsFileContent,
      electionWithMsEitherNeither
    )

    const expectedNumberOfVotesByPrecinct: Dictionary<number> = {
      6538: 6,
      6524: 7,
      6522: 19,
      6525: 11,
      6527: 5,
      6526: 8,
      6528: 7,
      6529: 12,
      6532: 9,
      6534: 5,
      6536: 3,
      6537: 5,
      6539: 3,
    }

    // Check that the number of ballots in each precinct report and the overall tally are as expected.
    expect(convertedTally.overallTally.numberOfBallotsCounted).toBe(100)
    for (const precinctId of Object.keys(expectedNumberOfVotesByPrecinct)) {
      const tallyForPrecinct = convertedTally.resultsByCategory.get(
        TallyCategory.Precinct
      )![precinctId]
      expect(tallyForPrecinct).toBeDefined()
      expect(tallyForPrecinct?.numberOfBallotsCounted).toBe(
        expectedNumberOfVotesByPrecinct[precinctId]!
      )
    }

    // Check some specific contest tallies in the overall tally
    const presidentTally = convertedTally.overallTally.contestTallies[
      '775020876'
    ]!
    expect(presidentTally.metadata).toStrictEqual({
      undervotes: 7,
      overvotes: 1,
      ballots: 100,
    })
    expect(presidentTally.tallies['775031988']!.tally).toBe(27)
    expect(presidentTally.tallies['775031987']!.tally).toBe(36)
    expect(presidentTally.tallies['775031989']!.tally).toBe(29)
    expect(presidentTally.tallies['__write-in']!.tally).toBe(0)

    const eitherNeitherTally = convertedTally.overallTally.contestTallies[
      '750000015'
    ]!
    expect(eitherNeitherTally.metadata).toStrictEqual({
      undervotes: 3,
      overvotes: 3,
      ballots: 98,
    })
    expect(eitherNeitherTally.tallies.yes?.tally).toBe(39)
    expect(eitherNeitherTally.tallies.no?.tally).toBe(53)

    const pickOneTally = convertedTally.overallTally.contestTallies[
      '750000016'
    ]!
    expect(pickOneTally.metadata).toStrictEqual({
      undervotes: 5,
      overvotes: 4,
      ballots: 98,
    })
    expect(pickOneTally.tallies.yes?.tally).toBe(40)
    expect(pickOneTally.tallies.no?.tally).toBe(49)

    // Check some specific tallies on a precinct tally, Fentress
    const fentressTally = convertedTally.resultsByCategory.get(
      TallyCategory.Precinct
    )!['6527']!
    const senateTally = fentressTally.contestTallies['775020877']!
    expect(senateTally.metadata).toStrictEqual({
      undervotes: 1,
      overvotes: 0,
      ballots: 5,
    })
    expect(senateTally.tallies['775031985']?.tally).toBe(1)
    expect(senateTally.tallies['775031986']?.tally).toBe(0)
    expect(senateTally.tallies['775031990']?.tally).toBe(3)
    expect(senateTally.tallies['__write-in']?.tally).toBe(0)

    const ballotmeasure2 = fentressTally.contestTallies['750000017']!
    expect(ballotmeasure2.metadata).toStrictEqual({
      undervotes: 0,
      overvotes: 0,
      ballots: 5,
    })
    expect(ballotmeasure2.tallies.yes?.tally).toBe(2)
    expect(ballotmeasure2.tallies.no?.tally).toBe(3)

    // Check snapshots
    expect(convertedTally.overallTally.contestTallies).toMatchSnapshot()
    for (const precinctId of Object.keys(expectedNumberOfVotesByPrecinct)) {
      const tallyForPrecinct = convertedTally.resultsByCategory.get(
        TallyCategory.Precinct
      )![precinctId]
      expect(tallyForPrecinct?.contestTallies).toMatchSnapshot()
    }
  })

  it('converts primary election sems file properly', async () => {
    const semsFileContent = await fs.readFile(primarySEMSPath, 'utf8')
    const convertedTally = convertSEMSFileToExternalTally(
      semsFileContent,
      multiPartyPrimaryElection
    )

    const expectedNumberOfVotesByPrecinct: Dictionary<number> = {
      'precinct-1': 870,
      'precinct-2': 840,
      'precinct-3': 570,
      'precinct-4': 840,
      'precinct-5': 1410,
    }

    // Check that the number of ballots in each precinct report and the overall tally are as expected.
    expect(convertedTally.overallTally.numberOfBallotsCounted).toBe(4530)
    for (const precinctId of Object.keys(expectedNumberOfVotesByPrecinct)) {
      const tallyForPrecinct = convertedTally.resultsByCategory.get(
        TallyCategory.Precinct
      )![precinctId]
      expect(tallyForPrecinct).toBeDefined()
      expect(tallyForPrecinct?.numberOfBallotsCounted).toBe(
        expectedNumberOfVotesByPrecinct[precinctId]!
      )
    }

    // Check some specific contest tallies on the overall tally.
    const assistantMayorLibertyTally =
      convertedTally.overallTally.contestTallies[
        'assistant-mayor-contest-liberty'
      ]
    expect(assistantMayorLibertyTally?.metadata).toStrictEqual({
      undervotes: 90,
      overvotes: 90,
      ballots: 450,
    })
    expect(assistantMayorLibertyTally?.tallies['jenna-morasca']?.tally).toBe(90)
    expect(
      assistantMayorLibertyTally?.tallies['sandra-diaz-twine']?.tally
    ).toBe(90)
    expect(assistantMayorLibertyTally?.tallies['__write-in']?.tally).toBe(90)

    const pokemonFederalist =
      convertedTally.overallTally.contestTallies['chief-pokemon-federalist']
    expect(pokemonFederalist?.metadata).toStrictEqual({
      undervotes: 30,
      overvotes: 30,
      ballots: 420,
    })
    expect(pokemonFederalist?.tallies.pikachu?.tally).toBe(30)
    expect(pokemonFederalist?.tallies.eevee?.tally).toBe(300)
    expect(pokemonFederalist?.tallies['__write-in']?.tally).toBe(30)

    const schoolboardConstitution =
      convertedTally.overallTally.contestTallies['schoolboard-constitution']

    expect(schoolboardConstitution?.metadata).toStrictEqual({
      undervotes: 450,
      overvotes: 600,
      ballots: 2100,
    })
    expect(schoolboardConstitution?.tallies['aras-baskauskas']?.tally).toBe(750)
    expect(schoolboardConstitution?.tallies['yul-kwon']?.tally).toBe(600)
    expect(schoolboardConstitution?.tallies['earl-cole']?.tally).toBe(600)
    expect(schoolboardConstitution?.tallies['todd-herzog']?.tally).toBe(600)
    expect(schoolboardConstitution?.tallies['__write-in']?.tally).toBe(600)

    // Check some specific tallies for precinct-1
    const precinct1Tally = convertedTally.resultsByCategory.get(
      TallyCategory.Precinct
    )!['precinct-1']!
    const governorConstitution = precinct1Tally.contestTallies[
      'governor-contest-constitution'
    ]!
    expect(governorConstitution.metadata).toStrictEqual({
      undervotes: 30,
      overvotes: 30,
      ballots: 420,
    })
    expect(governorConstitution.tallies['kristen-bell']?.tally).toBe(30)
    expect(governorConstitution.tallies['dax-shepherd']?.tally).toBe(300)
    expect(governorConstitution.tallies['__write-in']?.tally).toBe(30)

    const schoolboardLiberty = precinct1Tally.contestTallies[
      'schoolboard-liberty'
    ]!
    expect(schoolboardLiberty.metadata).toStrictEqual({
      undervotes: 0,
      overvotes: 0,
      ballots: 0,
    })
    expect(schoolboardLiberty.tallies['amber-brkich']?.tally).toBe(0)
    expect(schoolboardLiberty.tallies['chris-daugherty']?.tally).toBe(0)
    expect(schoolboardLiberty.tallies['tom-westman']?.tally).toBe(0)
    expect(schoolboardLiberty.tallies['danni-boatwright']?.tally).toBe(0)
    expect(schoolboardLiberty.tallies['__write-in']?.tally).toBe(0)

    // Check snapshots
    expect(convertedTally.overallTally.contestTallies).toMatchSnapshot()
    for (const precinctId of Object.keys(expectedNumberOfVotesByPrecinct)) {
      const tallyForPrecinct = convertedTally.resultsByCategory.get(
        TallyCategory.Precinct
      )![precinctId]
      expect(tallyForPrecinct?.contestTallies).toMatchSnapshot()
    }
  })
})
