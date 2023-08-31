import * as fixtures from '.';

test('has various election definitions', () => {
  expect(
    Object.entries(fixtures)
      .filter(([, value]) => typeof value !== 'function')
      .map(([key]) => key)
      .sort()
  ).toMatchInlineSnapshot(`
    [
      "electionComplexGeoSample",
      "electionFamousNames2021Fixtures",
      "electionGridLayoutNewHampshireAmherstFixtures",
      "electionGridLayoutNewHampshireHudsonFixtures",
      "electionMinimalExhaustiveSample",
      "electionMinimalExhaustiveSampleDefinition",
      "electionMinimalExhaustiveSampleFixtures",
      "electionMinimalExhaustiveSampleSinglePrecinct",
      "electionMinimalExhaustiveSampleSinglePrecinctDefinition",
      "electionMinimalExhaustiveSampleWithReportingUrl",
      "electionMinimalExhaustiveSampleWithReportingUrlDefinition",
      "electionMinimalExhaustiveSampleWithReportingUrlFixtures",
      "electionMultiPartyPrimaryFixtures",
      "electionSample",
      "electionSampleDefinition",
      "electionSampleLongContent",
      "electionSampleLongContentDefinition",
      "electionWithMsEitherNeither",
      "electionWithMsEitherNeitherDefinition",
      "electionWithMsEitherNeitherFixtures",
      "multiPartyPrimaryElection",
      "multiPartyPrimaryElectionDefinition",
      "sampleBallotImages",
      "systemSettings",
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
