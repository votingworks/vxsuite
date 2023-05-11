import { err, typedAs } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireAmherstFixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { SheetOf } from '@votingworks/types';
import { findLayout } from './find_layout';
import { TimingMarkGrid } from './types';

test('find layout from template images', async () => {
  const ballotImages: SheetOf<ImageData> = [
    await electionGridLayoutNewHampshireAmherstFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireAmherstFixtures.templateBack.asImageData(),
  ];

  const { layouts } = findLayout(ballotImages).unsafeUnwrap();
  expect(layouts).toEqual(
    typedAs<SheetOf<TimingMarkGrid>>([expect.any(Object), expect.any(Object)])
  );
  expect(layouts[0].grid.metadata.side).toEqual('front');
  expect(layouts[1].grid.metadata.side).toEqual('back');
  expect(layouts[0].bubbles).toHaveLength(32);
  expect(layouts[1].bubbles).toHaveLength(20);
});

test('returns Err on error', async () => {
  const ballotImages: SheetOf<ImageData> = [
    await sampleBallotImages.notBallot.asImageData(),
    await sampleBallotImages.notBallot.asImageData(),
  ];

  expect(findLayout(ballotImages)).toEqual(err(expect.anything()));
});
