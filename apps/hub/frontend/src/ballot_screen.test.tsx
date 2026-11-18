import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BallotType } from '@votingworks/types';
import type { DocumentProps } from 'react-pdf';
import { deferred, ok, type Result } from '@votingworks/basics';
import type { BallotLayoutError, BallotPreviewPdf } from '@votingworks/hmpb';
import { Buffer } from 'node:buffer';
import { createMemoryHistory } from 'history';
import { userEvent } from '@testing-library/user-event';
import {
  type MockApiClient,
  createMockApiClient,
  jurisdiction,
  provideApi,
} from '../test/api_helpers.js';
import {
  electionInfoFromElection,
  generalElectionRecord,
} from '../test/fixtures.js';
import { render, screen, waitFor } from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import { routes } from './routes.js';
import { BallotScreen } from './ballot_screen.js';

const electionRecord = generalElectionRecord(jurisdiction.id);
const electionId = electionRecord.election.id;
const ballotStyle = electionRecord.election.ballotStyles[0]!;
const precinct = electionRecord.election.precincts[0]!;

function MockDocument({ onLoadSuccess }: DocumentProps) {
  (onLoadSuccess as (args: { numPages: number }) => void)?.({ numPages: 1 });
  return <div>Mock Document</div>;
}

vi.mock(
  import('react-pdf'),
  () =>
    ({
      pdfjs: { GlobalWorkerOptions: { workerSrc: 'mock-worker-src' } },
      Document: MockDocument,
      Page: () => null,
    }) as unknown as typeof import('react-pdf')
);

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('shows the ballot viewer for the election ballot template', async () => {
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('NhStateBallot');
  apiMock.listBallotStyles
    .expectCallWith({ electionId })
    .resolves(electionRecord.election.ballotStyles);
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(electionRecord.election.precincts);
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromElection(electionRecord.election));
  apiMock.listParties
    .expectCallWith({ electionId })
    .resolves(electionRecord.election.parties);
  apiMock.getBallotLayoutSettings.expectCallWith({ electionId }).resolves({
    paperSize: electionRecord.election.ballotLayout.paperSize,
    compact: false,
  });
  const preview = deferred<Result<BallotPreviewPdf, BallotLayoutError>>();
  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      variant: undefined,
    })
    .returns(preview.promise);
  vi.mocked(URL.createObjectURL).mockReturnValue('blob:mock-pdf');
  const history = createMemoryHistory({
    initialEntries: [
      routes
        .election(electionId)
        .ballots.viewBallot(ballotStyle.id, precinct.id).path,
    ],
  });
  render(
    provideApi(
      apiMock,
      withRoute(<BallotScreen />, {
        paramPath: routes
          .election(':electionId')
          .ballots.viewBallot(':ballotStyleId', ':precinctId').path,
        history,
      })
    )
  );

  await screen.findByRole('heading', { name: 'View Ballot' });
  screen.getByRole('radio', { name: 'Federal Office Only' });
  expect(screen.getButton('Download PDF')).toBeDisabled();
  expect(screen.getButton('Print')).toBeDisabled();

  preview.resolve(
    ok({ pdfData: Buffer.from('mock ballot pdf'), fileName: 'mock ballot.pdf' })
  );
  await waitFor(() => expect(screen.getButton('Download PDF')).toBeEnabled());
  expect(screen.getButton('Print')).toBeEnabled();
  expect(screen.getByTitle('Print PDF')).toHaveAttribute(
    'src',
    'blob:mock-pdf'
  );

  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(history.location.pathname).toEqual(
    routes.election(electionId).ballots.root.path
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-pdf');
});
