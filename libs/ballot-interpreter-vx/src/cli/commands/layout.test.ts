import { promises as fs } from 'fs';
import { tmpNameSync } from 'tmp';
import { parseGlobalOptions } from '..';
import { blankPage1 } from '../../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { runCli } from '../../../test/utils';
import { loadImageData } from '../../utils/images';
import { adjacentFile } from '../../utils/path';
import { parseOptions } from './layout';

test('options', async () => {
  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'layout',
          'ballot01.png',
          'ballot02.png',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrap()
  ).toEqual({
    help: false,
    ballotImagePaths: ['ballot01.png', 'ballot02.png'],
  });
});

test('invalid options', async () => {
  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'layout',
          '--wrong',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrapErr().message
  ).toEqual(`unexpected option passed to 'layout': --wrong`);
});

test('help', async () => {
  const { stdout } = await runCli(['layout', '-h']);

  expect(stdout).toMatchInlineSnapshot(`
    "ballot-interpreter-vx layout IMG1 [IMG2 …]

    Examples

    # Annotate layout for a single ballot page.
    ballot-interpreter-vx layout ballot01.jpg

    # Annotate layout for many ballot pages.
    ballot-interpreter-vx layout ballot*.jpg
    "
  `);
});

test('creates a layout file adjacent to the input file', async () => {
  const imagePath = tmpNameSync();
  const layoutImagePath = adjacentFile('-layout', imagePath);

  await fs.copyFile(blankPage1.filePath(), imagePath);
  const { stdout } = await runCli(['layout', imagePath]);

  expect(stdout).toContain(layoutImagePath);

  const imageData = await loadImageData(imagePath);
  const layoutImageData = await loadImageData(layoutImagePath);
  expect({
    width: layoutImageData.width,
    height: layoutImageData.height,
  }).toEqual({ width: imageData.width, height: imageData.height });
});
