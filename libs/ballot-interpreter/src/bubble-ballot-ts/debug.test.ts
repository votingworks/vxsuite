import { expect, test, vi } from 'vitest';
import { napi } from './napi.js';
import { interpret } from './interpret.js';

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
    ballotImages: ['a.jpeg', 'b.jpeg'],
    debug: false,
    dbPath: 'ballots.db',
  }));

  expect(interpretPathsMock).toHaveBeenCalledWith(
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
    ballotImages: ['a.jpeg', 'b.jpeg'],
    debug: true,
    dbPath: 'ballots.db',
  }));

  expect(interpretPathsMock).toHaveBeenCalledWith(
    'a.jpeg',
    'b.jpeg',
    expect.any(Object)
  );
});
