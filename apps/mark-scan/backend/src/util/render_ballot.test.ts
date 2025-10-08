import { beforeEach, expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
  systemSettings,
} from '@votingworks/fixtures';
import { safeParseSystemSettings, TEST_JURISDICTION } from '@votingworks/types';
import { getPdfPageCount } from '@votingworks/image-utils';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { TestLanguageCode } from '@votingworks/test-utils';
import {
  getLayout,
  NoLayoutOptionError,
  ORDERED_BMD_BALLOT_LAYOUTS,
} from '@votingworks/ui';
import { assert, err, ok } from '@votingworks/basics';
import { renderBallot } from './render_ballot';
import { createWorkspace, Workspace } from './workspace';

const electionGeneralDefinition = readElectionGeneralDefinition();
const electionGeneral = electionGeneralDefinition.election;

vi.mock(import('@votingworks/image-utils'), async (importActual) => ({
  ...(await importActual()),
  getPdfPageCount: vi.fn().mockImplementation(() => {
    throw new Error('Unexpected call to getPdfPageCount during this test');
  }),
}));

vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  getLayout: vi.fn(),
}));

const precinctId = electionGeneralDefinition.election.precincts[1].id;
const ballotStyleId = electionGeneral.ballotStyles[0].id;

let workspace: Workspace;

beforeEach(() => {
  const mockWorkspaceDir = makeTemporaryDirectory();
  workspace = createWorkspace(mockWorkspaceDir, mockBaseLogger({ fn: vi.fn }));
  workspace.store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash: 'test-election-package-hash',
  });
  workspace.store.setPrecinctSelection(singlePrecinctSelectionFor(precinctId));
  workspace.store.setSystemSettings(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  workspace.store.setTestMode(true);
});

test('tries as many layouts as necessary and proceeds with the first that works', async () => {
  vi.mocked(getLayout).mockImplementation(
    (_machineType, _ballotStyleId, _electionDefinition, i) => {
      assert(i !== undefined);
      return i >= ORDERED_BMD_BALLOT_LAYOUTS.markScan.length
        ? err(new NoLayoutOptionError(0, 0, 'markScan'))
        : ok(ORDERED_BMD_BALLOT_LAYOUTS.markScan[i]);
    }
  );
  vi.mocked(getPdfPageCount).mockImplementationOnce(() => Promise.resolve(2));
  vi.mocked(getPdfPageCount).mockImplementationOnce(() => Promise.resolve(2));
  vi.mocked(getPdfPageCount).mockImplementationOnce(() => Promise.resolve(1));

  await renderBallot({
    store: workspace.store,
    precinctId,
    ballotStyleId,
    votes: {},
    languageCode: TestLanguageCode.ENGLISH,
  });

  expect(getLayout).toHaveBeenCalledTimes(3);
});

test('tries all layouts beginning with the least compacted layout and errors if none work', async () => {
  vi.mocked(getLayout).mockImplementation(
    (_machineType, _ballotStyleId, _electionDefinition, i) => {
      assert(i !== undefined);
      return i >= ORDERED_BMD_BALLOT_LAYOUTS.markScan.length
        ? err(new NoLayoutOptionError(0, 0, 'markScan'))
        : ok(ORDERED_BMD_BALLOT_LAYOUTS.markScan[i]);
    }
  );
  vi.mocked(getPdfPageCount).mockImplementation(() => Promise.resolve(2));

  await expect(
    renderBallot({
      store: workspace.store,
      precinctId,
      ballotStyleId,
      votes: {},
      languageCode: TestLanguageCode.ENGLISH,
    })
  ).rejects.toThrow('Unable to render ballot contents in a single page');

  expect(getLayout).toHaveBeenCalledTimes(
    ORDERED_BMD_BALLOT_LAYOUTS.markScan.length
  );
});

test('tries all layouts beginning with a slightly compacted layout and errors if none work', async () => {
  vi.mocked(getLayout).mockImplementation(
    (_machineType, _ballotStyleId, _electionDefinition, i) => {
      assert(i !== undefined);
      // getLayout picks a first layout to try given the nature of the election itself, e.g., if
      // there are many contests, we don't even try the least compacted layout
      const iAdjusted = i + 2;
      return iAdjusted >= ORDERED_BMD_BALLOT_LAYOUTS.markScan.length
        ? err(new NoLayoutOptionError(0, 0, 'markScan'))
        : ok(ORDERED_BMD_BALLOT_LAYOUTS.markScan[iAdjusted]);
    }
  );
  vi.mocked(getPdfPageCount).mockImplementation(() => Promise.resolve(2));

  await expect(
    renderBallot({
      store: workspace.store,
      precinctId,
      ballotStyleId,
      votes: {},
      languageCode: TestLanguageCode.ENGLISH,
    })
  ).rejects.toThrow('Unable to render ballot contents in a single page');

  expect(getLayout).toHaveBeenCalledTimes(
    ORDERED_BMD_BALLOT_LAYOUTS.markScan.length - 1
  );
});
