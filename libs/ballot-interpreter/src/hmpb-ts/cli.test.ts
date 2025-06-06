import { integers, iter } from '@votingworks/basics';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { writeImageData } from '@votingworks/image-utils';
import { mockWritable } from '@votingworks/test-utils';
import { asSheet, DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dirSync, fileSync } from 'tmp';
import { expect, test } from 'vitest';
import { pdfToPageImages } from '../../test/helpers/interpretation';
import { main } from './cli';

test('interpret CVRs', async () => {
  const ballotImages = asSheet(
    await pdfToPageImages(vxFamousNamesFixtures.blankBallotPath).toArray()
  );

  const rootDir = dirSync().name;
  const ids = integers()
    .take(3)
    .map(() => randomUUID())
    .toArray();
  const cvrDirs = ids.map((id) => join(rootDir, id));

  for (const [id, cvrDir] of iter(ids).zip(cvrDirs)) {
    await mkdir(cvrDir, { recursive: true });
    await writeFile(join(cvrDir, `${id}.json`), JSON.stringify({}));
    await writeImageData(join(cvrDir, `${id}-front.jpeg`), ballotImages[0]);
    await writeImageData(join(cvrDir, `${id}-back.jpeg`), ballotImages[1]);
  }

  const electionFilePath = fileSync().name;
  await writeFile(
    electionFilePath,
    vxFamousNamesFixtures.electionDefinition.electionData
  );
  const systemSettingsPath = fileSync().name;
  await writeFile(systemSettingsPath, JSON.stringify(DEFAULT_SYSTEM_SETTINGS));

  const stdout = mockWritable();
  const stderr = mockWritable();
  const exitCode = await main([electionFilePath, systemSettingsPath, rootDir], {
    stdout,
    stderr,
  });

  expect({
    exitCode,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  }).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining('Sherlock'),
    stderr: '',
  });
});
