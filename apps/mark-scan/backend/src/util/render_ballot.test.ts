import { beforeEach, expect, test, vi } from 'vitest';
import * as assert from 'node:assert';
import { mockBaseLogger } from '@votingworks/logging';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
  systemSettings,
} from '@votingworks/fixtures';
import { safeParseSystemSettings, TEST_JURISDICTION } from '@votingworks/types';
import {
  getPdfPageCount,
  PdfPage,
  pdfToImages,
} from '@votingworks/image-utils';
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
  pdfToImages: vi.fn().mockImplementation(() => {
    throw new Error('Unexpected call to pdfToImages during this test');
  }),
  parsePdf: vi.fn().mockImplementation(() => {
    throw new Error('Unexpected call to parsePdf during this test');
  }),
  getPdfPageCount: vi.fn().mockImplementation(() => {
    throw new Error('Unexpected call to getPdfPageCount during this test');
  }),
}));

vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  getLayout: vi.fn(),
}));

const precinctId = electionGeneralDefinition.election.precincts[1].id;

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

test("throws an error if a single page can't be rendered after max retries", async () => {
  vi.mocked(getLayout).mockImplementation(() =>
    ok(ORDERED_BMD_BALLOT_LAYOUTS.mark[0])
  );
  vi.mocked(getPdfPageCount).mockImplementation(() => Promise.resolve(2));

  const { store } = workspace;
  const ballotStyleId = electionGeneral.ballotStyles[0].id;

  let error: Error | undefined;
  try {
    await renderBallot({
      store,
      precinctId,
      ballotStyleId,
      votes: {},
      languageCode: TestLanguageCode.ENGLISH,
    });
  } catch (e) {
    assert.ok(e instanceof Error);
    error = e;
  }

  expect(error?.message).toEqual(
    'Unable to render ballot contents in a single page'
  );
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
