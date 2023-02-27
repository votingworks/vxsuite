import {
  election,
  electionMinimalExhaustive,
  electionPrimaryNonpartisanContests,
  primaryElection,
} from '../../../test/election';
import { Election } from '../../election';
import {
  convertCdfBallotDefinitionToVxfElection,
  convertVxfElectionToCdfBallotDefinition,
} from './convert';
import { mockNow, testCdfBallotDefinition, testVxfElection } from './fixtures';

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date(mockNow));
});

test('convertVxfElectionToCdfBallotDefinition', () => {
  expect(convertVxfElectionToCdfBallotDefinition(testVxfElection)).toEqual(
    testCdfBallotDefinition
  );
});

test('convertCdfBallotDefinitionToVxfElection', () => {
  expect(
    convertCdfBallotDefinitionToVxfElection(testCdfBallotDefinition)
  ).toEqual(testVxfElection);
});

// In CDF, we require an explicit yes/no contest option for every ballot measure contest.
test('convertVxfElectionToCdfBallotDefinition supplies default yes/no contest options', () => {
  expect(
    convertVxfElectionToCdfBallotDefinition({
      ...testVxfElection,
      contests: testVxfElection.contests.map((contest) =>
        contest.type === 'yesno'
          ? { ...contest, yesOption: undefined, noOption: undefined }
          : contest
      ),
    })
  ).toEqual(testCdfBallotDefinition);
});

/**
 * For testing a round trip from VXF -> CDF -> VXF, we need to normalize a few
 * less strict parts of VXF to match stricter CDF constraints.
 */
function normalizeVxf(vxfElection: Election) {
  // Omit fields that are not part of CDF
  const {
    title,
    date,
    state,
    county,
    districts,
    precincts,
    parties,
    contests,
    ballotStyles,
  } = vxfElection;
  const dateWithoutTime = new Date(date.split('T')[0]);
  const isoDateString = `${dateWithoutTime.toISOString().split('.')[0]}Z`;
  return {
    title,
    date: isoDateString,
    state,
    county,
    districts,
    precincts,
    parties,
    // VXF allows optional yes/no options, but in CDF we always list them explicitly.
    contests: contests.map((contest) =>
      contest.type === 'yesno'
        ? {
            ...contest,
            yesOption: contest.yesOption || { label: 'Yes', id: 'option-yes' },
            noOption: contest.noOption || { label: 'No', id: 'option-no' },
          }
        : contest
    ),
    ballotStyles,
  };
}

const elections = [
  election,
  primaryElection,
  electionMinimalExhaustive,
  electionPrimaryNonpartisanContests,
];

for (const vxf of elections) {
  test(`round trip conversion for election fixture: ${vxf.title}`, () => {
    const cdf = convertVxfElectionToCdfBallotDefinition(vxf);
    expect(cdf).toMatchSnapshot();
    expect(convertCdfBallotDefinitionToVxfElection(cdf)).toEqual(
      normalizeVxf(vxf)
    );
  });
}
