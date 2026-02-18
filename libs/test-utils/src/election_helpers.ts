import { DateWithoutTime } from '@votingworks/basics';
import {
  AnyContest,
  BallotStyle,
  CandidateContest,
  District,
  Election,
  ElectionDefinition,
  HmpbBallotPaperSize,
  Party,
  Precinct,
  safeParseElectionDefinition,
  VotesDict,
  YesNoContest,
} from '@votingworks/types';

/**
 * Options for creating a test election with configurable contests.
 */
export interface CreateTestElectionOptions {
  numCandidateContests: number;
  numYesNoContests: number;
  candidatesPerContest: number;
  longCandidateNames?: boolean;
  longContestTitles?: boolean;
  longYesNoLabels?: boolean;
}

/**
 * Creates a test election with a configurable number of contests.
 * This is useful for testing multi-page ballot layouts and other scenarios
 * that require elections with many contests.
 */
export function createTestElection(
  options: CreateTestElectionOptions
): Election {
  const {
    numCandidateContests,
    numYesNoContests,
    candidatesPerContest,
    longCandidateNames = false,
    longContestTitles = false,
    longYesNoLabels = false,
  } = options;

  const district: District = {
    id: 'district-1',
    name: 'Test District',
  };

  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Test Precinct',
    districtIds: [district.id],
  };

  const party: Party = {
    id: 'party-1',
    name: 'Test Party',
    fullName: 'Test Party',
    abbrev: 'TP',
  };

  const contests: AnyContest[] = [];

  // Generate candidate contests
  for (let i = 0; i < numCandidateContests; i += 1) {
    const contestTitle = longContestTitles
      ? `Office of the Commissioner for Long Department Name Number ${i + 1}`
      : `Office ${i + 1}`;

    const candidateContest: CandidateContest = {
      id: `candidate-contest-${i}`,
      type: 'candidate',
      districtId: district.id,
      title: contestTitle,
      seats: 1,
      allowWriteIns: true,
      candidates: Array.from({ length: candidatesPerContest }, (_, j) => ({
        id: `candidate-${i}-${j}`,
        name: longCandidateNames
          ? `Candidate With A Very Long Name For Testing Purposes Number ${
              j + 1
            }`
          : `Candidate ${j + 1}`,
        partyIds: [party.id],
      })),
    };
    contests.push(candidateContest);
  }

  // Generate yes/no contests
  for (let i = 0; i < numYesNoContests; i += 1) {
    const yesNoContest: YesNoContest = {
      id: `yesno-contest-${i}`,
      type: 'yesno',
      districtId: district.id,
      title: longContestTitles
        ? `Proposition ${
            i + 1
          }: Amendment to the State Constitution Regarding Important Matter`
        : `Proposition ${i + 1}`,
      description: `This is a description for proposition ${
        i + 1
      }. It explains what the proposition does.`,
      yesOption: {
        id: `yesno-${i}-yes`,
        label: longYesNoLabels
          ? `Yes, I approve of this proposition and all of its amendments and changes to the existing law`
          : `Yes`,
      },
      noOption: {
        id: `yesno-${i}-no`,
        label: longYesNoLabels
          ? `No, I do not approve of this proposition and prefer the current law to remain unchanged`
          : `No`,
      },
    };
    contests.push(yesNoContest);
  }

  const ballotStyle: BallotStyle = {
    id: 'ballot-style-1',
    groupId: 'ballot-style-1',
    precincts: [precinct.id],
    districts: [district.id],
  };

  const election: Election = {
    id: 'test-election',
    type: 'general',
    title: 'Test Election for Multi-Page Summary Ballots',
    date: new DateWithoutTime('2024-11-05'),
    state: 'Test State',
    county: {
      id: 'county-1',
      name: 'Test County',
    },
    seal: '',
    parties: [party],
    districts: [district],
    precincts: [precinct],
    ballotStyles: [ballotStyle],
    contests,
    ballotLayout: {
      metadataEncoding: 'qr-code',
      paperSize: HmpbBallotPaperSize.Letter,
    },
    ballotStrings: {},
  };

  return election;
}

/**
 * Creates an ElectionDefinition from an Election object.
 */
export function createElectionDefinition(
  election: Election
): ElectionDefinition {
  const electionData = JSON.stringify(election);
  return safeParseElectionDefinition(electionData).unsafeUnwrap();
}

/**
 * Creates mock votes selecting the first option for each contest.
 * Useful for testing ballot rendering with complete vote data.
 *
 * @param contests - The contests to create votes for
 * @param contestIds - Optional filter to only create votes for specific contest IDs
 */
export function createMockVotes(
  contests: AnyContest[],
  contestIds?: string[]
): VotesDict {
  const filteredContests = contestIds
    ? contests.filter((c) => contestIds.includes(c.id))
    : contests;

  const votes: VotesDict = {};
  for (const contest of filteredContests) {
    if (contest.type === 'candidate') {
      votes[contest.id] = contest.candidates.slice(0, contest.seats);
    } else if (contest.type === 'yesno') {
      votes[contest.id] = [contest.yesOption.id];
    }
    // Skip straight-party contests — test helpers don't generate votes for them
  }
  return votes;
}
