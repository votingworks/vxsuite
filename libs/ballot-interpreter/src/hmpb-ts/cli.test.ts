import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { dirSync, fileSync } from 'tmp';
import { mkdir, writeFile } from 'node:fs/promises';
import { integers, iter } from '@votingworks/basics';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mockWritable } from '@votingworks/test-utils';
import { main } from './cli';

test('interpret CVRs', async () => {
  const rootDir = dirSync().name;
  const ids = integers()
    .take(3)
    .map(() => randomUUID())
    .toArray();
  const cvrDirs = ids.map((id) => join(rootDir, id));

  for (const [id, cvrDir] of iter(ids).zip(cvrDirs)) {
    await mkdir(cvrDir, { recursive: true });
    await writeFile(join(cvrDir, `${id}.json`), JSON.stringify({}));
    await writeFile(
      join(cvrDir, `${id}-front.jpeg`),
      electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asBuffer()
    );
    await writeFile(
      join(cvrDir, `${id}-back.jpeg`),
      electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asBuffer()
    );
  }

  const electionFilePath =
    electionGridLayoutNewHampshireTestBallotFixtures.electionJson.asFilePath();
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
    stdout: expect.stringContaining('Governor'),
    stderr: '',
  });
});
