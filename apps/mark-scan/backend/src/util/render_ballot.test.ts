import tmp from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import {
  electionGeneral,
  electionGeneralDefinition,
  systemSettings,
} from '@votingworks/fixtures';
import { safeParseSystemSettings, TEST_JURISDICTION } from '@votingworks/types';
import { PdfPage, pdfToImages } from '@votingworks/image-utils';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { ImageData } from 'canvas';
import { mockOf, TestLanguageCode } from '@votingworks/test-utils';
import {
  getLayout,
  NoLayoutOptionError,
  ORDERED_BMD_BALLOT_LAYOUTS,
} from '@votingworks/ui';
import { err, ok } from '@votingworks/basics';
import { renderBallot } from './render_ballot';
import { createWorkspace, Workspace } from './workspace';

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

jest.mock('@votingworks/image-utils', () => ({
  ...jest.requireActual('@votingworks/image-utils'),
  pdfToImages: jest.fn(),
}));

jest.mock('@votingworks/ui', () => ({
  ...jest.requireActual('@votingworks/ui'),
  getLayout: jest.fn(),
}));

const precinctId = electionGeneralDefinition.election.precincts[1].id;

let workspace: Workspace;

beforeEach(() => {
  const mockWorkspaceDir = tmp.dirSync();
  workspace = createWorkspace(mockWorkspaceDir.name, mockBaseLogger());
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
  mockOf(getLayout).mockImplementation(() =>
    ok(ORDERED_BMD_BALLOT_LAYOUTS.mark[0])
  );
  mockOf(pdfToImages).mockImplementation(() => mockPdfToImages(2));

  const { store } = workspace;
  const electionDefinition = electionGeneral;
  const ballotStyleId = electionDefinition.ballotStyles[0].id;

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

test('short ciruits if getLayout returns an error', async () => {
  mockOf(getLayout).mockImplementation(() => {
    return err(new NoLayoutOptionError(10, 10, 'markScan'));
  });
  mockOf(pdfToImages).mockImplementation(() => mockPdfToImages(1));

  const { store } = workspace;
  const electionDefinition = electionGeneral;
  const ballotStyleId = electionDefinition.ballotStyles[0].id;

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
