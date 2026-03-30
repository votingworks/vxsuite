import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { expect, test, vi } from 'vitest';
import { napi } from './napi';
import { interpret } from './interpret';

const { electionDefinition } = vxFamousNamesFixtures;

vi.mock('./napi');

const interpretPathsMock = vi.mocked(napi.interpretPaths);

test('no debug', async () => {
  interpretPathsMock.mockResolvedValue({
    type: 'err',
    value: {
      type: 'invalidScale',
      label: 'side A',
      scale: 0.9,
      isBubbleBallot: true,
    },
  });

  void (await interpret({
    electionDefinition,
    ballotImages: ['a.jpeg', 'b.jpeg'],
    debug: false,
  }));

  expect(interpretPathsMock).toHaveBeenCalledWith(
    electionDefinition.election,
    'a.jpeg',
    'b.jpeg',
    expect.any(Object)
  );
});

test('debug with image paths', async () => {
  interpretPathsMock.mockResolvedValue({
    type: 'err',
    value: {
      type: 'invalidScale',
      label: 'side A',
      scale: 0.9,
      isBubbleBallot: true,
    },
  });

  void (await interpret({
    electionDefinition,
    ballotImages: ['a.jpeg', 'b.jpeg'],
    debug: true,
  }));

  expect(interpretPathsMock).toHaveBeenCalledWith(
    electionDefinition.election,
    'a.jpeg',
    'b.jpeg',
    expect.any(Object)
  );
});
