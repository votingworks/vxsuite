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
    `"fe05f99d5886bfcbbbc388844ec44e77dbde2c2426a836188350cdcef3f60c5d"`
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
