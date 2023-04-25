import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { dirSync, fileSync } from 'tmp';
import { DEV_JURISDICTION } from '@votingworks/auth';
import { Store } from '../store';
import * as interpretNh from './nh';

const jurisdiction = DEV_JURISDICTION;

test('interpret', async () => {
  const dbPath = fileSync().name;
  const ballotImagesPath = dirSync().name;
  const store = await Store.fileStore(dbPath);

  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;
  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
  });

  const result = await interpretNh.interpret(
    store,
    'test-sheet',
    [
      electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asFilePath(),
      electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asFilePath(),
    ],
    ballotImagesPath
  );

  const [frontResult, backResult] = result.unsafeUnwrap();

  expect(frontResult.interpretation.type).toEqual('InterpretedHmpbPage');
  expect(backResult.interpretation.type).toEqual('InterpretedHmpbPage');

  const images = (await readdir(ballotImagesPath)).map((filename) =>
    join(ballotImagesPath, filename)
  );
  expect(images).toContain(frontResult.originalFilename);
  expect(images).toContain(frontResult.normalizedFilename);
  expect(images).toContain(backResult.originalFilename);
  expect(images).toContain(backResult.normalizedFilename);
});
