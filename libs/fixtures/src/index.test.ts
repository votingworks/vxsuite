import * as fixtures from '.'

test('has various election definitions', () => {
  expect(Object.keys(fixtures)).toMatchInlineSnapshot(`
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
