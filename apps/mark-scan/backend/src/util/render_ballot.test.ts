import { beforeEach, expect, test, vi } from 'vitest';
import tmp from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import {
  readElectionGeneralDefinition,
  systemSettings,
} from '@votingworks/fixtures';
import { safeParseSystemSettings, TEST_JURISDICTION } from '@votingworks/types';
import { PdfPage, pdfToImages } from '@votingworks/image-utils';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { ImageData } from 'canvas';
import { TestLanguageCode } from '@votingworks/test-utils';
import {
  getLayout,
  NoLayoutOptionError,
  ORDERED_BMD_BALLOT_LAYOUTS,
} from '@votingworks/ui';
import { err, ok } from '@votingworks/basics';
import { renderBallot } from './render_ballot';
import { createWorkspace, Workspace } from './workspace';

const electionGeneralDefinition = readElectionGeneralDefinition();
const electionGeneral = electionGeneralDefinition.election;

async function* mockPdfToImages(pageCount: number): AsyncIterable<PdfPage> {
  await Promise.resolve();

  for (let i = 0; i < pageCount; i += 1) {
    yield {
      pageNumber: i + 1, // pageNumber is 1-indexed
      pageCount,
      page: new ImageData(1, 1),
    };
  }
}

vi.mock(import('@votingworks/image-utils'), async (importActual) => ({
  ...(await importActual()),
  pdfToImages: vi.fn(),
}));

vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  getLayout: vi.fn(),
}));

const precinctId = electionGeneralDefinition.election.precincts[1].id;

let workspace: Workspace;

beforeEach(() => {
  const mockWorkspaceDir = tmp.dirSync();
  workspace = createWorkspace(
    mockWorkspaceDir.name,
    mockBaseLogger({ fn: vi.fn })
  );
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

test("throws an error if a single page can't be rendered after max retries", async () => {
  vi.mocked(getLayout).mockImplementation(() =>
    ok(ORDERED_BMD_BALLOT_LAYOUTS.mark[0])
  );
  vi.mocked(pdfToImages).mockImplementation(() => mockPdfToImages(2));

  const { store } = workspace;
  const ballotStyleId = electionGeneral.ballotStyles[0].id;

  await expect(
    renderBallot({
      store,
      precinctId,
      ballotStyleId,
      votes: {},
      languageCode: TestLanguageCode.ENGLISH,
    })
  ).rejects.toThrow('Unable to render ballot contents in a single page');
});

test('short circuits if getLayout returns an error', async () => {
  vi.mocked(getLayout).mockImplementation(() =>
    err(new NoLayoutOptionError(10, 10, 'markScan'))
  );
  vi.mocked(pdfToImages).mockImplementation(() => mockPdfToImages(1));

  const { store } = workspace;
  const ballotStyleId = electionGeneral.ballotStyles[0].id;

  await expect(
    renderBallot({
      store,
      precinctId,
      ballotStyleId,
      votes: {},
      languageCode: TestLanguageCode.ENGLISH,
    })
  ).rejects.toThrow('Unable to render ballot contents in a single page');
});
