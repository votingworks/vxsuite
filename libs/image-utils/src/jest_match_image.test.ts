import { expect, test } from 'vitest';
import { sampleBallotImages } from '@votingworks/fixtures';
import { createImageData } from 'canvas';
import { basename } from 'node:path';
import { crop } from './crop';

test('matching images', async () => {
  const image = createImageData(1, 1);
  await expect(image).toMatchImage(image);
  await expect(expect(image).not.toMatchImage(image)).rejects.toThrowError(
    'Expected the images to differ, but they are equal.'
  );
});

test('mismatching images', async () => {
  const notBallot = await sampleBallotImages.notBallot.asImageData();
  const topLeft100x100 = crop(notBallot, {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const bottomRight100x100 = crop(notBallot, {
    x: notBallot.width - 100,
    y: notBallot.height - 100,
    width: 100,
    height: 100,
  });

  await expect(topLeft100x100).not.toMatchImage(bottomRight100x100);
  await expect(
    expect(topLeft100x100).toMatchImage(bottomRight100x100)
  ).rejects.toThrowError(
    /Expected the images to be equal, but they differ by \d+ pixels \(\d+%\)\./
  );
});

test('mismatching images with diff path', async () => {
  const { currentTestName } = expect.getState();
  const notBallot = await sampleBallotImages.notBallot.asImageData();
  const cropped = crop(notBallot, {
    x: 300,
    y: 300,
    width: 100,
    height: 100,
  });
  const slightlyOffset = crop(notBallot, {
    x: 305,
    y: 305,
    width: 100,
    height: 100,
  });

  const diffPath = `/tmp/${basename(__filename)}.${currentTestName?.replace(
    /[^a-z0-9]+/g,
    '-'
  )}-diff.png`;
  await expect(cropped).not.toMatchImage(slightlyOffset, { diffPath });
  await expect(
    expect(cropped).toMatchImage(slightlyOffset, { diffPath })
  ).rejects.toThrowError(
    /Expected the images to be equal, but they differ by \d+ pixels \(\d+%\)\. Diff image saved to/
  );
});

test('mismatching images with failure threshold', async () => {
  const notBallot = await sampleBallotImages.notBallot.asImageData();
  const topLeft100x100 = crop(notBallot, {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const offsetTopLeft100x100 = crop(notBallot, {
    x: 1,
    y: 1,
    width: 100,
    height: 100,
  });

  await expect(topLeft100x100).toMatchImage(offsetTopLeft100x100, {
    failureThreshold: 0.1,
  });
  await expect(
    expect(topLeft100x100).toMatchImage(offsetTopLeft100x100, {
      failureThreshold: 0.01,
    })
  ).rejects.toThrowError(
    /Expected the images to be equal, but they differ by \d+ pixels \(\d+%\)\./
  );
});
