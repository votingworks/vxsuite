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
    `"594d90c1ea60cfb0db0eb9428f6c493e626400d6c2dd62f6f9a49c211bedaafe"`
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

test('v4.0 elections may omit polling places; conversion to latest defaults one per precinct', () => {
  // `pollingPlaces` was optional in v4.0 but v4.1+ requires at least one.
  // Simulate a real v4.0 election that omits the field.
  const v4p0Election = convertLatestElectionToV4p0(primaryElection);
  const { pollingPlaces: _pollingPlaces, ...withoutPollingPlaces } =
    v4p0Election;
  const v4p0ElectionData = JSON.stringify(withoutPollingPlaces);

  // The v4.0 schema accepts elections without `pollingPlaces`.
  const v4p0Parsed =
    safeParseElectionDefinitionV4p0(v4p0ElectionData).unsafeUnwrap();
  expect(v4p0Parsed.election.pollingPlaces).toBeUndefined();

  // Converting to the latest version generates an election-day polling place
  // per precinct so the now-required field is satisfied.
  const upgraded =
    safeParseElectionDefinitionForAnySoftwareVersion(
      v4p0ElectionData
    ).unsafeUnwrap().election;
  expect(upgraded.pollingPlaces).toEqual(
    primaryElection.precincts.map((precinct) => ({
      id: `${precinct.id}-polling-place`,
      name: precinct.name,
      precincts: { [precinct.id]: { type: 'whole' } },
      type: 'election_day',
    }))
  );
});
