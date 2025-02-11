import { afterEach, beforeEach, test, vi } from 'vitest';
import { BallotType } from '@votingworks/types';
import { DocumentProps, PageProps } from 'react-pdf';
import { useEffect } from 'react';
import { ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MockApiClient,
  createMockApiClient,
  nonVxUser,
  provideApi,
} from '../test/api_helpers';
import { generalElectionRecord } from '../test/fixtures';
import { render, screen } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { BallotScreen } from './ballot_screen';

const electionId = generalElectionRecord.election.id;
const ballotStyle = generalElectionRecord.ballotStyles[0];
const precinct = generalElectionRecord.precincts[0];

function MockDocument({
  children,
  onLoadSuccess,
  onSourceSuccess,
  file,
}: DocumentProps) {
  useEffect(() => {
    onSourceSuccess?.();
    (onLoadSuccess as (args: { numPages: number }) => void)?.({ numPages: 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div>Mock Document</div>
      <div>{file && (file as { data: Buffer }).data.toString('utf-8')}</div>
      {children}
    </div>
  );
}

function MockPage({ pageNumber }: PageProps) {
  return <div>Mock Page {pageNumber}</div>;
}

vi.mock(import('react-pdf'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    pdfjs: { GlobalWorkerOptions: { workerSrc: 'mock-worker-src' } },
    Document: MockDocument,
    Page: MockPage,
  } as unknown as typeof original;
});

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen() {
  render(
    provideApi(
      apiMock,
      withRoute(<BallotScreen />, {
        paramPath: routes
          .election(':electionId')
          .ballots.viewBallot(':ballotStyleId', ':precinctId').path,
        path: routes
          .election(electionId)
          .ballots.viewBallot(ballotStyle.id, precinct.id).path,
      }),
      electionId
    )
  );
}

test('shows a PDF ballot preview', async () => {
  apiMock.getUser.expectCallWith().resolves(nonVxUser);
  apiMock.getElection
    .expectCallWith({ user: nonVxUser, electionId })
    .resolves(generalElectionRecord);
  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock ballot pdf'),
        fileName: 'mock ballot.pdf',
      })
    );
  renderScreen();

  await screen.findByRole('heading', { name: 'View Ballot' });
  screen.getByRole('button', { name: 'Close' });

  const document = screen.getByText('Mock Document').parentElement!;
  await within(document).findByText('mock ballot pdf');
  await within(document).findByText('Mock Page 1');
  await within(document).findByText('Mock Page 2');

  screen.getByText('Page: 1/2');
  screen.getByText('100%');

  const zoomInButton = screen.getByRole('button', { name: 'Zoom In' });
  userEvent.click(zoomInButton);
  screen.getByText('125%');
  userEvent.click(zoomInButton);
  screen.getByText('150%');
  userEvent.click(zoomInButton);
  screen.getByText('175%');
  userEvent.click(zoomInButton);
  screen.getByText('200%');
  userEvent.click(zoomInButton);
  screen.getByText('200%');

  const zoomOutButton = screen.getByRole('button', { name: 'Zoom Out' });
  userEvent.click(zoomOutButton);
  screen.getByText('175%');
  userEvent.click(zoomOutButton);
  screen.getByText('150%');
  userEvent.click(zoomOutButton);
  screen.getByText('125%');
  userEvent.click(zoomOutButton);
  screen.getByText('100%');
  userEvent.click(zoomOutButton);
  screen.getByText('75%');
  userEvent.click(zoomOutButton);
  screen.getByText('50%');
  userEvent.click(zoomOutButton);
  screen.getByText('25%');
  userEvent.click(zoomOutButton);
  screen.getByText('25%');

  screen.getByText(ballotStyle.id);
  screen.getByText(precinct.name);
  screen.getByText('8.5 x 11 inches (Letter)');
});

test('changes ballot type', async () => {
  apiMock.getUser.expectCallWith().resolves(nonVxUser);
  apiMock.getElection
    .expectCallWith({ user: nonVxUser, electionId })
    .resolves(generalElectionRecord);
  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock precinct ballot pdf'),
        fileName: 'mock precinct ballot.pdf',
      })
    );
  renderScreen();

  await screen.findByRole('heading', { name: 'View Ballot' });
  screen.getByText('mock precinct ballot pdf');
  const ballotTypeRadioGroup = screen.getByRole('radiogroup', {
    name: 'Ballot Type',
  });
  within(ballotTypeRadioGroup).getByRole('radio', {
    name: 'Precinct',
    checked: true,
  });
  const absenteeRadioOption = within(ballotTypeRadioGroup).getByRole('radio', {
    name: 'Absentee',
    checked: false,
  });

  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Absentee,
      ballotMode: 'official',
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock absentee ballot pdf'),
        fileName: 'mock absentee ballot.pdf',
      })
    );
  userEvent.click(absenteeRadioOption);
  await screen.findByText('mock absentee ballot pdf');
  screen.getByRole('radio', { name: 'Absentee', checked: true });
});

test('changes tabulation mode', async () => {
  apiMock.getUser.expectCallWith().resolves(nonVxUser);
  apiMock.getElection
    .expectCallWith({ user: nonVxUser, electionId })
    .resolves(generalElectionRecord);
  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock official ballot pdf'),
        fileName: 'mock official ballot.pdf',
      })
    );
  renderScreen();

  await screen.findByRole('heading', { name: 'View Ballot' });
  screen.getByText('mock official ballot pdf');
  const tabulationModeRadioGroup = screen.getByRole('radiogroup', {
    name: 'Tabulation Mode',
  });
  within(tabulationModeRadioGroup).getByRole('radio', {
    name: 'Official Ballot',
    checked: true,
  });
  const testRadioOption = within(tabulationModeRadioGroup).getByRole('radio', {
    name: 'L&A Test Ballot',
    checked: false,
  });
  within(tabulationModeRadioGroup).getByRole('radio', {
    name: 'Sample Ballot',
    checked: false,
  });

  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock test ballot pdf'),
        fileName: 'mock test ballot.pdf',
      })
    );
  userEvent.click(testRadioOption);
  await screen.findByText('mock test ballot pdf');
  screen.getByRole('radio', { name: 'L&A Test Ballot', checked: true });
});
