import * as fixtures from '.'

test('has various election definitions', () => {
  expect(
    Object.entries(fixtures)
      .filter(([, value]) => typeof value !== 'function')
      .map(([key]) => key)
  ).toMatchInlineSnapshot(`
    Array [
      "electionSample",
      "primaryElectionSample",
      "multiPartyPrimaryElection",
      "electionSampleLongContent",
      "electionWithMsEitherNeither",
      "electionSampleDefinition",
      "primaryElectionSampleDefinition",
      "multiPartyPrimaryElectionDefinition",
      "electionSampleLongContentDefinition",
      "electionWithMsEitherNeitherDefinition",
    ]
  `)
})
