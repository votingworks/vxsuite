import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { findGrid } from './find_grid';

test('findGrid', async () => {
  const { grid, normalizedImage } = findGrid(
    await electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asImageData()
  );
  expect(typeof grid).toEqual('object');
  expect(typeof normalizedImage).toEqual('object');
});
