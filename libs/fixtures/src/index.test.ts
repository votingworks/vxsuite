import * as fixtures from '.'

test('has various election definitions', () => {
  expect(
    Object.entries(fixtures)
      .filter(([, value]) => typeof value !== 'function')
      .map(([key]) => key)
  ).toMatchInlineSnapshot(`
    Array [
      "electionSample",
      "electionSample2",
      "primaryElectionSample",
      "multiPartyPrimaryElection",
      "electionSampleLongContent",
      "electionWithMsEitherNeither",
      "electionSampleDefinition",
      "electionSample2Definition",
      "primaryElectionSampleDefinition",
      "multiPartyPrimaryElectionDefinition",
      "electionSampleLongContentDefinition",
      "electionWithMsEitherNeitherDefinition",
      "electionMultiPartyPrimaryInternal",
      "electionSimplePrimaryInternal",
      "electionSample2Internal",
      "electionWithMsEitherNeitherInternal",
    ]
  `)
})
