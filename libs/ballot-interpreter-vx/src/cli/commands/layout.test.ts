import { promises as fs } from 'fs';
import MemoryStream from 'memorystream';
import { tmpNameSync } from 'tmp';
import { parseGlobalOptions } from '..';
import { blankPage1 } from '../../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { loadImageData } from '../../utils/images';
import { adjacentFile } from '../../utils/path';
import { parseOptions, printHelp, run } from './layout';

test('options', async () => {
  expect(
    await parseOptions(
      parseGlobalOptions([
        'node',
        'ballot-interpreter-vx',
        'layout',
        'ballot01.png',
        'ballot02.png',
      ])
    )
  ).toEqual({ ballotImagePaths: ['ballot01.png', 'ballot02.png'] });
});

test('invalid options', async () => {
  await expect(
    parseOptions(
      parseGlobalOptions(['node', 'ballot-interpreter-vx', 'layout', '--wrong'])
    )
  ).rejects.toThrowError(`unexpected option passed to 'layout': --wrong`);
});

test('help', () => {
  const stdout = new MemoryStream();
  printHelp('ballot-interpreter-vx', stdout);
  expect(Buffer.from(stdout.read()).toString('utf-8')).toMatchInlineSnapshot(`
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
  const stdin = new MemoryStream();
  const stdout = new MemoryStream();

  await fs.copyFile(blankPage1.filePath(), imagePath);
  await run(
    await parseOptions(
      parseGlobalOptions(['node', 'ballot-interpreter-vx', 'layout', imagePath])
    ),
    stdin,
    stdout
  );

  expect(Buffer.from(stdout.read()).toString('utf-8')).toContain(
    layoutImagePath
  );

  const imageData = await loadImageData(imagePath);
  const layoutImageData = await loadImageData(layoutImagePath);
  expect({
    width: layoutImageData.width,
    height: layoutImageData.height,
  }).toEqual({ width: imageData.width, height: imageData.height });
});
