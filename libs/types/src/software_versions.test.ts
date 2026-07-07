import { expect, test } from 'vitest';
import { z } from 'zod/v4';
import { assertDefined } from '@votingworks/basics';
import { Election, SheetPositions } from './election';
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

// Mirrors the yesno -> yesOption/noOption conversion in
// convertLatestElectionToV4p0 for the 2-option ballot measures in the fixtures.
function toV4p0Contests(contests: Election['contests']) {
  return contests.map((contest) => {
    if (contest.type !== 'yesno') return contest;
    const { options, ...rest } = contest;
    return { ...rest, yesOption: options[0], noOption: options[1] };
  });
}

test('convertLatestElectionToV4p0', () => {
  // v4.0 uses `county`/`countyName` where v4.1 uses
  // `jurisdiction`/`jurisdictionName`; everything else is unchanged.
  expect(convertLatestElectionToV4p0(election)).toEqual({
    ...election,
    contests: toV4p0Contests(election.contests),
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

  // Primaries carry the same `primary` type across versions.
  expect(convertLatestElectionToV4p0(primaryElection)).toEqual({
    ...primaryElection,
    contests: toV4p0Contests(primaryElection.contests),
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

  // Open primaries convert like any other primary: the open-vs-closed
  // distinction is carried by ballot styles' partyId, not the election type.
  const combinedBallotPrimaryElection: Election = {
    ...primaryElection,
    ballotStyles: primaryElection.ballotStyles.map((bs) => ({
      ...bs,
      partyId: undefined,
    })),
  };
  expect(convertLatestElectionToV4p0(combinedBallotPrimaryElection)).toEqual({
    ...combinedBallotPrimaryElection,
    contests: toV4p0Contests(combinedBallotPrimaryElection.contests),
    jurisdiction: undefined,
    county: combinedBallotPrimaryElection.jurisdiction,
    ballotStrings: {
      ...combinedBallotPrimaryElection.ballotStrings,
      en: {
        ...combinedBallotPrimaryElection.ballotStrings['en'],
        jurisdictionName: undefined,
        countyName:
          combinedBallotPrimaryElection.ballotStrings['en']?.[
            'jurisdictionName'
          ],
      },
    },
  });
});

test('convertLatestElectionToV4p0 converts yesno contests with more than two options to candidate contests', () => {
  const districtId = assertDefined(election.districts[0]).id;
  const threeOptionMeasure: Election['contests'][number] = {
    id: 'measure-1',
    type: 'yesno',
    districtId,
    title: 'Measure 1',
    description: 'A three-option ballot measure',
    options: [
      { id: 'measure-1-yes', label: 'Yes' },
      { id: 'measure-1-no', label: 'No' },
      { id: 'measure-1-maybe', label: 'Maybe' },
    ],
  };
  const twoOptionMeasure: Election['contests'][number] = {
    id: 'measure-2',
    type: 'yesno',
    districtId,
    title: 'Measure 2',
    description: 'A standard yes/no ballot measure',
    options: [
      { id: 'measure-2-yes', label: 'Yes' },
      { id: 'measure-2-no', label: 'No' },
    ],
  };
  const electionWithMeasures: Election = {
    ...election,
    contests: [...election.contests, threeOptionMeasure, twoOptionMeasure],
  };

  const v4p0 = convertLatestElectionToV4p0(electionWithMeasures);

  // The 3-option measure becomes a candidate contest (one candidate per
  // option); the description is dropped since candidate contests have none.
  expect(v4p0.contests).toContainEqual({
    id: 'measure-1',
    type: 'candidate',
    districtId,
    title: 'Measure 1',
    candidates: [
      { id: 'measure-1-yes', name: 'Yes' },
      { id: 'measure-1-no', name: 'No' },
      { id: 'measure-1-maybe', name: 'Maybe' },
    ],
    allowWriteIns: false,
    seats: 1,
  });
  // The standard 2-option measure stays a yesno contest but uses the v4.0
  // yesOption/noOption shape.
  expect(v4p0.contests).toContainEqual({
    id: 'measure-2',
    type: 'yesno',
    districtId,
    title: 'Measure 2',
    description: 'A standard yes/no ballot measure',
    yesOption: { id: 'measure-2-yes', label: 'Yes' },
    noOption: { id: 'measure-2-no', label: 'No' },
  });

  // The dropped description of the 3-option measure is preserved in
  // additionalHashInput so it still affects the ballot hash. The 2-option
  // measure keeps its description on the contest, so it isn't included.
  expect(
    assertDefined(v4p0.additionalHashInput)[
      'contestDescriptionsForContestsWithAdditionalOptions'
    ]
  ).toEqual({ 'measure-1': 'A three-option ballot measure' });
});

test('convertLatestElectionToV4p0 leaves additionalHashInput untouched when there are no multi-option yesno contests', () => {
  expect(convertLatestElectionToV4p0(election).additionalHashInput).toEqual(
    election.additionalHashInput
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
    `"2eed58532057418228ff007d96c26a6d43529a5cf7d4e04ec925c3ae27861f30"`
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

test('ballot positions round-trip through the v4.0 gridLayouts shape', () => {
  // v4.1+ stores geometry as hierarchical `ballotPositions` per ballot style;
  // v4.0 stores it as a flat `gridLayouts` array on the election. Each option's
  // bounds correspond to a single shared outset ({ top:1, left:1, right:9,
  // bottom:1 }) so the geometry round-trips exactly.
  const ballotPositions: SheetPositions[] = [
    // One sheet: [front contests, back contests].
    [
      // front
      [
        {
          contestId: 'contest-1',
          bounds: { row: 11, column: 1, width: 10, height: 4 },
          options: [
            {
              type: 'option',
              bubbleCenter: { row: 12, column: 2 },
              bounds: { row: 11, column: 1, width: 10, height: 2 },
              optionId: 'candidate-1',
              partyIds: ['party-1'],
            },
            {
              type: 'write-in',
              bubbleCenter: { row: 14, column: 2 },
              bounds: { row: 13, column: 1, width: 10, height: 2 },
              writeInIndex: 0,
              writeInArea: { row: 13, column: 2.5, width: 3, height: 1 },
            },
          ],
        },
      ],
      // back
      [
        {
          contestId: 'contest-2',
          bounds: { row: 19, column: 1, width: 10, height: 2 },
          options: [
            {
              type: 'option',
              bubbleCenter: { row: 20, column: 2 },
              bounds: { row: 19, column: 1, width: 10, height: 2 },
              optionId: 'contest-2-option-yes',
            },
          ],
        },
      ],
    ],
  ];
  const [firstBallotStyle, ...restBallotStyles] = election.ballotStyles;
  const electionWithPositions: Election = {
    ...election,
    ballotStyles: [
      { ...firstBallotStyle, ballotPositions },
      ...restBallotStyles,
    ],
  };

  // Converting to v4.0 moves ballotPositions into a flat gridLayouts array and
  // drops it from the ballot styles.
  const v4p0Election = convertLatestElectionToV4p0(electionWithPositions);
  expect(v4p0Election.gridLayouts).toHaveLength(1);
  expect(v4p0Election.ballotStyles[0]).not.toHaveProperty('ballotPositions');

  // Converting back reconstructs the identical ballotPositions.
  const roundTripped = safeParseElectionDefinitionForAnySoftwareVersion(
    JSON.stringify(v4p0Election)
  ).unsafeUnwrap().election;
  expect(roundTripped.ballotStyles[0]?.ballotPositions).toEqual(
    ballotPositions
  );
  expect(roundTripped.ballotStyles[1]?.ballotPositions).toBeUndefined();
});

test('convertLatestElectionToV4p0 throws when ballot style has non-uniform option bounds', () => {
  // Two options with different bounds (different outsets from their bubble
  // centers) — this is what real per-option measurements will look like once
  // the render accuracy work lands.
  const nonUniformBallotPositions: SheetPositions[] = [
    [
      [
        {
          contestId: 'contest-1',
          bounds: { row: 9, column: 1, width: 10, height: 4 },
          options: [
            {
              type: 'option',
              bubbleCenter: { row: 10, column: 2 },
              // outset: top=1, left=1, right=9, bottom=3  (height 4)
              bounds: { row: 9, column: 1, width: 10, height: 4 },
              optionId: 'candidate-1',
            },
            {
              type: 'option',
              bubbleCenter: { row: 14, column: 2 },
              // outset: top=1, left=1, right=9, bottom=1  (height 2) — DIFFERENT
              bounds: { row: 13, column: 1, width: 10, height: 2 },
              optionId: 'candidate-2',
            },
          ],
        },
      ],
      [],
    ],
  ];
  const [firstBallotStyle, ...restBallotStyles] = election.ballotStyles;
  const electionWithNonUniform: Election = {
    ...election,
    ballotStyles: [
      { ...firstBallotStyle, ballotPositions: nonUniformBallotPositions },
      ...restBallotStyles,
    ],
  };

  expect(() => convertLatestElectionToV4p0(electionWithNonUniform)).toThrow(
    /non-uniform option bounds/
  );
});
