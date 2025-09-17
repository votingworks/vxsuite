import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { expect, test, vi } from 'vitest';
import * as addon from './addon';
import { interpret } from './interpret';

const { electionDefinition } = vxFamousNamesFixtures;

vi.mock('./addon');

const interpretImplMock = vi.mocked(addon.interpret);

test('no debug', () => {
  interpretImplMock.mockReturnValue({
    type: 'err',
    value: { type: 'invalidScale', label: 'side A', scale: 0.9 },
  });

  void interpret({
    electionDefinition,
    ballotImages: ['a.jpeg', 'b.jpeg'],
    debug: false,
  });

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionDefinition.election,
    'a.jpeg',
    'b.jpeg',
    expect.any(Object)
  );
});

test('debug with image paths', () => {
  interpretImplMock.mockReturnValue({
    type: 'err',
    value: { type: 'invalidScale', label: 'side A', scale: 0.9 },
  });

  void interpret({
    electionDefinition,
    ballotImages: ['a.jpeg', 'b.jpeg'],
    debug: true,
  });

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionDefinition.election,
    'a.jpeg',
    'b.jpeg',
    expect.any(Object)
  );
});
