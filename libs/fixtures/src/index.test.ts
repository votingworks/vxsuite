import { expect, test } from 'vitest';
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
  expect(
    fixtures.asElectionDefinition(fixtures.readElectionGeneral())
  ).toStrictEqual(
    expect.objectContaining({
      election: fixtures.readElectionGeneral(),
      electionData: expect.any(String),
      ballotHash: expect.any(String),
    })
  );
});
