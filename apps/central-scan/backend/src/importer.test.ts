import { dirSync } from 'tmp';
import { typedAs } from '@votingworks/basics';
import { MarkThresholds, TEST_JURISDICTION } from '@votingworks/types';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { Importer } from './importer';
import { createWorkspace } from './util/workspace';
import { makeMockScanner } from '../test/util/mocks';

const jurisdiction = TEST_JURISDICTION;

test('no election is configured', async () => {
  const workspace = createWorkspace(dirSync().name);
  const scanner = makeMockScanner();
  const importer = new Importer({
    workspace,
    scanner,
  });

  await expect(importer.startImport()).rejects.toThrowError(
    'no election configuration'
  );

  await expect(
    importer.importSheet('batch-1', '/tmp/front.jpeg', '/tmp/back.jpeg')
  ).rejects.toThrowError('no election configuration');
});

test('setting mark threshold overrides are stored in the database', () => {
  const workspace = createWorkspace(dirSync().name);
  const scanner = makeMockScanner();
  const importer = new Importer({
    workspace,
    scanner,
  });

  importer.configure(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
    jurisdiction
  );

  importer.setMarkThresholdOverrides({
    marginal: 0.05,
    definite: 0.06,
  });

  expect(workspace.store.getMarkThresholdOverrides()).toEqual(
    typedAs<MarkThresholds>({
      marginal: 0.05,
      definite: 0.06,
    })
  );
});
