import {
  electionSample,
  electionMultiPartyPrimaryWithDataFiles,
  electionWithMsEitherNeitherWithDataFiles,
} from '@votingworks/fixtures'
import { CandidateContest, Dictionary, YesNoContest } from '@votingworks/types'
import { buildCandidateTallies } from '../../test/util/buildCandidateTallies'

import {
  ContestOptionTally,
  ExternalTallySourceType,
  TallyCategory,
  VotingMethod,
} from '../config/types'
import { writeInCandidate } from './election'
import {
  getContestTallyForCandidateContest,
  getContestTallyForYesNoContest,
  SEMSFileRow,
  convertSEMSFileToExternalTally,
  parseSEMSFileAndValidateForElection,
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
  electionMultiPartyPrimaryWithDataFiles.electionDefinition.election
const electionWithMsEitherNeither =
  electionWithMsEitherNeitherWithDataFiles.electionDefinition.election

const eitherNeitherSEMSContent =
  electionWithMsEitherNeitherWithDataFiles.semsData
const primarySEMSContent = electionMultiPartyPrimaryWithDataFiles.semsData

const presidentcontest = electionSample.contests.find(
  (c) => c.id === 'president'
) as CandidateContest

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
    const convertedTally = convertSEMSFileToExternalTally(
      eitherNeitherSEMSContent,
      electionWithMsEitherNeither,
      VotingMethod.Precinct,
      'file-name',
      new Date(2020, 3, 1)
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
    expect(convertedTally.inputSourceName).toBe('file-name')
    expect(convertedTally.source).toBe(ExternalTallySourceType.SEMS)
    expect(convertedTally.votingMethod).toBe(VotingMethod.Precinct)
    expect(convertedTally.timestampCreated).toStrictEqual(new Date(2020, 3, 1))
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
    const convertedTally = convertSEMSFileToExternalTally(
      primarySEMSContent,
      multiPartyPrimaryElection,
      VotingMethod.Absentee,
      'file-name',
      new Date(2020, 3, 1)
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
    expect(convertedTally.votingMethod).toBe(VotingMethod.Absentee)
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

describe('parseSEMSFileAndValidateForElection', () => {
  it('returns error for a bad precinct id', () => {
    const csvRowRaw =
      '"10","not-a-precinct-id","750000015","Ballot Measure 1","0","NP","1","Times Over Voted","0","NP","0",'
    expect(
      parseSEMSFileAndValidateForElection(
        csvRowRaw,
        electionWithMsEitherNeither
      )
    ).toEqual([
      'Precinct ID not-a-precinct-id is not found in the election definition.',
    ])
  })

  it('returns error for a bad contest id', () => {
    const csvRowRaw =
      '"10","6522","not-a-contest-id","Ballot Measure 1","0","NP","1","Times Over Voted","0","NP","0",'
    expect(
      parseSEMSFileAndValidateForElection(
        csvRowRaw,
        electionWithMsEitherNeither
      )
    ).toEqual([
      'Contest ID not-a-contest-id is not found in the election definition.',
    ])
  })

  it('returns error for a bad candidate id in a yes no contest', () => {
    const csvRowRaw =
      '"10","6522","750000015","Ballot Measure 1","0","NP","not-a-choice","Something","0","NP","0",'
    expect(
      parseSEMSFileAndValidateForElection(
        csvRowRaw,
        electionWithMsEitherNeither
      )
    ).toEqual([
      'Contest Choice ID not-a-choice is not a valid contest choice ID for the contest: 750000015.',
    ])
  })

  it('returns error for a bad candidate id in a candidate contest', () => {
    const csvRowRaw =
      '"10","6522","775020876","President","0","NP","not-a-choice","Something","0","NP","0",'
    expect(
      parseSEMSFileAndValidateForElection(
        csvRowRaw,
        electionWithMsEitherNeither
      )
    ).toEqual([
      'Candidate ID not-a-choice is not a valid candidate ID for the contest: 775020876.',
    ])
  })

  it('only rejects a write in candidate ID when there are more then 0 votes and a contest does not allow write in candidates', () => {
    // Write in candidate row for a contest with no write ins allowed
    const csvRowRaw =
      '"10","23","president","President","0","NP","0","Write In Votes","0","NP","3",'
    expect(
      parseSEMSFileAndValidateForElection(csvRowRaw, electionSample)
    ).toEqual([
      'Candidate ID 0 is not a valid candidate ID for the contest: president.',
    ])

    // Allow a write in with 0 votes
    const csvRowRaw2 =
      '"10","23","president","President","0","NP","0","Write In Votes","0","NP","0",'
    expect(
      parseSEMSFileAndValidateForElection(csvRowRaw2, electionSample)
    ).toEqual([])

    // Write in candidate row for a contest with write ins allowed
    const csvRowRaw3 =
      '"10","23","county-commissioners","County Commissioners","0","NP","0","Write In Votes","0","NP","3",'
    expect(
      parseSEMSFileAndValidateForElection(csvRowRaw3, electionSample)
    ).toEqual([])
  })

  it('ignores write in row for yes/no contest with 0 votes', () => {
    // Errors when write in row has more then 0 votes
    const csvRowRaw =
      '"10","6522","750000017","Ballot Measure 2","0","NP","0","Write In Votes","0","NP","3",'
    expect(
      parseSEMSFileAndValidateForElection(
        csvRowRaw,
        electionWithMsEitherNeither
      )
    ).toEqual([
      'Contest Choice ID 0 is not a valid contest choice ID for the contest: 750000017.',
    ])

    // Allow and ignores a write in with 0 votes
    const csvRowRaw2 =
      '"10","6522","750000017","Ballot Measure 2","0","NP","0","Write In Votes","0","NP","0",'
    expect(
      parseSEMSFileAndValidateForElection(
        csvRowRaw2,
        electionWithMsEitherNeither
      )
    ).toEqual([])
  })

  it('rejects importing a yes/no contest if the yes no options are not specified in the election definition', () => {
    // Write in candidate row for a contest with write ins allowed
    const csvRowRaw2 =
      '"10","23","judicial-robert-demergue","Judicial Robert Demergue","0","NP","1","Over Votes","0","NP","0",'
    expect(
      parseSEMSFileAndValidateForElection(csvRowRaw2, electionSample)
    ).toEqual([
      'Election definition not configured to handle SEMs data formats, IDs must be specified on the yes no contest: judicial-robert-demergue.',
    ])
  })

  it('returns no errors for valid file', () => {
    expect(
      parseSEMSFileAndValidateForElection(
        eitherNeitherSEMSContent,
        electionWithMsEitherNeither
      )
    ).toEqual([])

    expect(
      parseSEMSFileAndValidateForElection(
        primarySEMSContent,
        multiPartyPrimaryElection
      )
    ).toEqual([])
  })

  it('returns all errors when there are many', () => {
    expect(
      parseSEMSFileAndValidateForElection(
        eitherNeitherSEMSContent,
        multiPartyPrimaryElection
      )
    ).toHaveLength(1114)
  })

  it('returns error when no valid CSV data is found', () => {
    expect(
      parseSEMSFileAndValidateForElection('', multiPartyPrimaryElection)
    ).toEqual([
      'No valid CSV data found in imported file. Please check file contents.',
    ])

    expect(
      parseSEMSFileAndValidateForElection(
        JSON.stringify({ this: { is: ['a', 'random', 'json', 'blob'] } }),
        multiPartyPrimaryElection
      )
    ).toEqual([
      'No valid CSV data found in imported file. Please check file contents.',
    ])
  })

  it('can parse a row with a comma in the contest name', () => {
    const csvRowRaw2 =
      '"10","6522","750000017","Ballot ,Measure 2","0","NP","0","Write In Votes","0","NP","0",'
    expect(
      parseSEMSFileAndValidateForElection(
        csvRowRaw2,
        electionWithMsEitherNeither
      )
    ).toEqual([])
  })
})
