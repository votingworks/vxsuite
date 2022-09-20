import * as fixtures from '.';

test('has various election definitions', () => {
  expect(
    Object.entries(fixtures)
      .filter(([, value]) => typeof value !== 'function')
      .map(([key]) => key)
      .sort()
  ).toMatchInlineSnapshot(`
    Array [
      "electionFamousNames2021Fixtures",
      "electionGridLayout",
      "electionGridLayoutDefinition",
      "electionMinimalExhaustiveSample",
      "electionMinimalExhaustiveSampleDefinition",
      "electionMinimalExhaustiveSampleFixtures",
      "electionMinimalExhaustiveSampleRightSideTargets",
      "electionMinimalExhaustiveSampleRightSideTargetsDefinition",
      "electionMinimalExhaustiveSampleWithReportingUrl",
      "electionMinimalExhaustiveSampleWithReportingUrlDefinition",
      "electionMinimalExhaustiveSampleWithReportingUrlFixtures",
      "electionMultiPartyPrimaryFixtures",
      "electionSample",
      "electionSample2",
      "electionSample2Definition",
      "electionSample2Fixtures",
      "electionSampleDefinition",
      "electionSampleLongContent",
      "electionSampleLongContentDefinition",
      "electionSampleNoSeal",
      "electionSampleNoSealDefinition",
      "electionSampleRotation",
      "electionSampleRotationDefinition",
      "electionWithMsEitherNeither",
      "electionWithMsEitherNeitherDefinition",
      "electionWithMsEitherNeitherFixtures",
      "multiPartyPrimaryElection",
      "multiPartyPrimaryElectionDefinition",
      "primaryElectionSample",
      "primaryElectionSampleDefinition",
      "primaryElectionSampleFixtures",
    ]
  `);
});

test('asElectionDefinition', () => {
  expect(fixtures.asElectionDefinition(fixtures.electionSample)).toStrictEqual(
    expect.objectContaining({
      election: fixtures.electionSample,
      electionData: expect.any(String),
      electionHash: expect.any(String),
    })
  );
});
