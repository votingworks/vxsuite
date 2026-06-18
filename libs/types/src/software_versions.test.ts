import { expect, test } from 'vitest';
import { z } from 'zod/v4';
import { Election } from './election';
import { safeParseElectionDefinition } from './election_parsing';
import {
  convertLatestElectionToV4p0,
  safeParseElectionDefinitionForAnySoftwareVersion,
  safeParseElectionDefinitionV4p0,
} from './software_versions';
import { election, primaryElection } from '../test/election';

// v4.0 represents ballot measures as `type: 'yesno'` with discrete
// yesOption/noOption fields, so the conversion maps the latest `options` array
// back to that shape.
function contestsToV4p0(contests: Election['contests']) {
  return contests.map((contest) => {
    if (contest.type !== 'measure') return contest;
    const { options, ...rest } = contest;
    return {
      ...rest,
      type: 'yesno',
      yesOption: options[0],
      noOption: options[1],
    };
  });
}

const generalElectionData = JSON.stringify(election);
const closedPrimaryElectionData = JSON.stringify(primaryElection);
const v4p0PrimaryElectionData = JSON.stringify(
  convertLatestElectionToV4p0(primaryElection)
);

test('convertLatestElectionToV4p0', () => {
  // v4.0 uses `county`/`countyName` where v4.1 uses
  // `jurisdiction`/`jurisdictionName`; everything else is unchanged.
  expect(convertLatestElectionToV4p0(election)).toEqual({
    ...election,
    jurisdiction: undefined,
    county: election.jurisdiction,
    contests: contestsToV4p0(election.contests),
    ballotStrings: {
      ...election.ballotStrings,
      en: {
        ...election.ballotStrings['en'],
        jurisdictionName: undefined,
        countyName: election.ballotStrings['en']?.['jurisdictionName'],
      },
    },
  });

  // closed-primary -> primary, same county/countyName conversion
  expect(convertLatestElectionToV4p0(primaryElection)).toEqual({
    ...primaryElection,
    type: 'primary',
    jurisdiction: undefined,
    county: primaryElection.jurisdiction,
    contests: contestsToV4p0(primaryElection.contests),
    ballotStrings: {
      ...primaryElection.ballotStrings,
      en: {
        ...primaryElection.ballotStrings['en'],
        jurisdictionName: undefined,
        countyName: primaryElection.ballotStrings['en']?.['jurisdictionName'],
      },
    },
  });

  const openPrimaryElection: Election = {
    ...primaryElection,
    type: 'open-primary',
    ballotStyles: primaryElection.ballotStyles.map((bs) => ({
      ...bs,
      partyId: undefined,
    })),
  };
  expect(() => convertLatestElectionToV4p0(openPrimaryElection)).toThrow(
    'v4.0 does not support open primaries'
  );
});

test('safeParseElectionDefinitionV4p0', () => {
  const electionDefinition = safeParseElectionDefinitionV4p0(
    v4p0PrimaryElectionData
  ).unsafeUnwrap();
  expect(electionDefinition.election).toEqual(
    convertLatestElectionToV4p0(primaryElection)
  );
  expect(electionDefinition.electionData).toEqual(v4p0PrimaryElectionData);
  expect(electionDefinition.ballotHash).toMatchInlineSnapshot(
    `"95ab4fe5feddf6ef37edaa514b62df2220e138e2b64ba06b96678436ee578ac6"`
  );

  expect(
    safeParseElectionDefinitionV4p0(closedPrimaryElectionData).err()
  ).toBeInstanceOf(z.ZodError);
  expect(safeParseElectionDefinitionV4p0('not json').err()).toBeInstanceOf(
    SyntaxError
  );
  const badDateElectionData = JSON.stringify({
    ...convertLatestElectionToV4p0(primaryElection),
    date: 'not-a-date',
  });
  expect(
    safeParseElectionDefinitionV4p0(badDateElectionData).err()
  ).toBeInstanceOf(z.ZodError);
});

test('safeParseElectionDefinitionForAnySoftwareVersion', () => {
  expect(
    safeParseElectionDefinitionForAnySoftwareVersion(
      generalElectionData
    ).unsafeUnwrap().election
  ).toEqual(election);
  expect(
    safeParseElectionDefinitionForAnySoftwareVersion(
      closedPrimaryElectionData
    ).unsafeUnwrap().election
  ).toEqual(primaryElection);

  expect(
    safeParseElectionDefinitionForAnySoftwareVersion(
      v4p0PrimaryElectionData
    ).unsafeUnwrap().election
  ).toEqual(primaryElection);

  // When the input is invalid for every version, the error returned is the
  // latest version's error (not the v4.0 parsing error)
  const invalidElectionData = JSON.stringify({
    ...primaryElection,
    type: 'not-a-real-type',
  });
  const result =
    safeParseElectionDefinitionForAnySoftwareVersion(invalidElectionData);
  expect(result.err()).toEqual(
    safeParseElectionDefinition(invalidElectionData).err()
  );
});

test('v4.0 ballot styles may omit languages; conversion to latest defaults them to en', () => {
  // `languages` was optional in v4.0 but is required in v4.1+. Simulate a real
  // v4.0 election whose ballot styles omit the field.
  const v4p0Election = convertLatestElectionToV4p0(primaryElection);
  const v4p0ElectionData = JSON.stringify({
    ...v4p0Election,
    ballotStyles: v4p0Election.ballotStyles.map((ballotStyle) => {
      const { languages: _languages, ...rest } = ballotStyle;
      return rest;
    }),
  });

  // The v4.0 schema accepts ballot styles without `languages`.
  const v4p0Parsed =
    safeParseElectionDefinitionV4p0(v4p0ElectionData).unsafeUnwrap();
  expect(v4p0Parsed.election.ballotStyles[0]?.languages).toBeUndefined();

  // Converting to the latest version fills in ['en'] so the now-required field
  // is satisfied.
  const upgraded =
    safeParseElectionDefinitionForAnySoftwareVersion(
      v4p0ElectionData
    ).unsafeUnwrap().election;
  expect(upgraded.ballotStyles.length).toBeGreaterThan(0);
  for (const ballotStyle of upgraded.ballotStyles) {
    expect(ballotStyle.languages).toEqual(['en']);
  }
});
