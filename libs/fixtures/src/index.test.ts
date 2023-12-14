import * as fixtures from '.';

test('has various election definitions', () => {
  expect(
    Object.entries(fixtures)
      .filter(([, value]) => typeof value !== 'function')
      .map(([key]) => key)
      .sort()
  ).toMatchSnapshot();
});

test('asElectionDefinition', () => {
  expect(fixtures.asElectionDefinition(fixtures.electionGeneral)).toStrictEqual(
    expect.objectContaining({
      election: fixtures.electionGeneral,
      electionData: expect.any(String),
      electionHash: expect.any(String),
    })
  );
});
