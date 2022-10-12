import { markKey } from './mark_key';

test('mark key', () => {
  expect(
    markKey({
      type: 'candidate',
      score: 0.05,
      scoredOffset: { x: 0, y: 0 },
      target: {
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        inner: { x: 0, y: 0, width: 0, height: 0 },
      },
      contestId: '1',
      optionId: '2',
      bounds: { x: 3, y: 4, width: 5, height: 6 },
    })
  ).toBe('1-2-3-4');
});
