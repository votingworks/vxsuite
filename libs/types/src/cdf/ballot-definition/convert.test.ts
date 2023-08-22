import { ok } from '@votingworks/basics';
import {
  election,
  electionMinimalExhaustive,
  primaryElection,
} from '../../../test/election';
import { Election } from '../../election';
import {
  convertCdfBallotDefinitionToVxfElection,
  convertVxfElectionToCdfBallotDefinition,
  safeParseCdfBallotDefinition,
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
    ballotLayout,
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
            yesOption: contest.yesOption || {
              label: 'Yes',
              id: `${contest.id}-option-yes`,
            },
            noOption: contest.noOption || {
              label: 'No',
              id: `${contest.id}-option-no`,
            },
          }
        : contest
    ),
    ballotStyles,
    ballotLayout,
  };
}

const elections = [election, primaryElection, electionMinimalExhaustive];

for (const vxf of elections) {
  test(`round trip conversion for election fixture: ${vxf.title}`, () => {
    const cdf = convertVxfElectionToCdfBallotDefinition(vxf);
    expect(cdf).toMatchSnapshot();
    expect(convertCdfBallotDefinitionToVxfElection(cdf)).toEqual(
      normalizeVxf(vxf)
    );
  });
}

test('safeParseCdfBallotDefinition', () => {
  // Try a malformed CDF ballot definition that will cause the convert function
  // to throw an error (needed to cover the case that catches these errors)
  expect(
    safeParseCdfBallotDefinition({
      ...testCdfBallotDefinition,
      GpUnit: testCdfBallotDefinition.GpUnit.filter(
        (unit) => unit.Type === 'state'
      ),
    })
  ).toMatchInlineSnapshot(`
    Err {
      "error": [Error: unable to find an element matching a predicate],
    }
  `);

  // Duplicate ids should be rejected
  expect(
    safeParseCdfBallotDefinition({
      ...testCdfBallotDefinition,
      GpUnit: testCdfBallotDefinition.GpUnit.map((unit, i) => ({
        ...unit,
        '@id': `same-id-${i}`,
      })),
      Party: testCdfBallotDefinition.Party.map((party, i) => ({
        ...party,
        '@id': `same-id-${i}`,
      })),
    })
  ).toMatchInlineSnapshot(`
    Err {
      "error": [Error: Ballot definition contains duplicate @ids: same-id-0, same-id-1],
    }
  `);

  expect(safeParseCdfBallotDefinition(testCdfBallotDefinition)).toEqual(
    ok(testVxfElection)
  );
});
