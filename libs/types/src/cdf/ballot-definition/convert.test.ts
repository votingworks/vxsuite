import { ok } from '@votingworks/basics';
import {
  election,
  electionMinimalExhaustive,
  primaryElection,
} from '../../../test/election';
import { safeParseElection } from '../../election_parsing';
import {
  convertCdfBallotDefinitionToVxfElection,
  convertVxfElectionToCdfBallotDefinition,
  safeParseCdfBallotDefinition,
} from './convert';
import {
  normalizeVxf,
  testCdfBallotDefinition,
  testVxfElection,
} from './fixtures';

test('VXF fixture is valid', () => {
  expect(safeParseElection(election)).toEqual(ok(election));
});

test('convertVxfElectionToCdfBallotDefinition', () => {
  expect(convertVxfElectionToCdfBallotDefinition(testVxfElection)).toEqual(
    testCdfBallotDefinition
  );
});

test('convertCdfBallotDefinitionToVxfElection', () => {
  expect(
    convertCdfBallotDefinitionToVxfElection(testCdfBallotDefinition)
  ).toEqual(normalizeVxf(testVxfElection));
});

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
    ok(normalizeVxf(testVxfElection))
  );
});
