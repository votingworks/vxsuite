import { afterEach, beforeEach, expect, test, vi, describe } from 'vitest';
import {
  BallotType,
  type CandidateContest,
  LanguageCode,
  type YesNoContest,
} from '@votingworks/types';
import type {
  BallotLayoutError,
  BallotPreviewPdf,
  BallotTemplateId,
} from '@votingworks/hmpb';
import type { DocumentProps, PageProps } from 'react-pdf';
import { type ReactNode, useEffect } from 'react';
import {
  DateWithoutTime,
  deferred,
  err,
  ok,
  type Result,
} from '@votingworks/basics';
import type { ElectionInfo } from '@votingworks/election-definition-backend';
import { readElectionGeneral } from '@votingworks/fixtures';
import { Buffer } from 'node:buffer';
import { within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  type MockApiClient,
  createMockApiClient,
  provideApi,
} from '../test/api_helpers.js';
import { render, screen } from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import { BallotViewer, type BallotViewerProps } from './ballot_viewer.js';

const election = readElectionGeneral();
const electionId = election.id;
const ballotStyle = election.ballotStyles[0]!;
const precinct = election.precincts[0]!;

const electionInfo: ElectionInfo = {
  electionId,
  type: 'general',
  date: new DateWithoutTime('2026-11-03'),
  title: 'General Election',
  state: 'Demo State',
  jurisdictionName: 'Demo County',
  seal: '',
  languageCodes: [LanguageCode.ENGLISH],
};

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
      <div>
        {file && new TextDecoder().decode((file as { data: Uint8Array }).data)}
      </div>
      {children as ReactNode}
    </div>
  );
}

function MockPage({ pageNumber }: PageProps) {
  return <div>Mock Page {pageNumber}</div>;
}

// Don't load the real react-pdf: importing it evaluates pdfjs-dist, which
// requires browser APIs (e.g. DOMMatrix) that jsdom doesn't provide.
vi.mock(
  import('react-pdf'),
  () =>
    ({
      pdfjs: { GlobalWorkerOptions: { workerSrc: 'mock-worker-src' } },
      Document: MockDocument,
      Page: MockPage,
    }) as unknown as typeof import('react-pdf')
);

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  apiMock.listBallotStyles
    .expectCallWith({ electionId })
    .resolves(election.ballotStyles);
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(election.precincts);
  apiMock.getElectionInfo.expectCallWith({ electionId }).resolves(electionInfo);
  apiMock.listParties.expectCallWith({ electionId }).resolves(election.parties);
  apiMock.getBallotLayoutSettings.expectCallWith({ electionId }).resolves({
    paperSize: election.ballotLayout.paperSize,
    compact: false,
  });
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderViewer(
  ballotTemplateId: BallotTemplateId = 'VxDefaultBallot',
  renderActions: BallotViewerProps['renderActions'] = () => null
) {
  render(
    provideApi(
      apiMock,
      withRoute(
        <BallotViewer
          electionId={electionId}
          ballotStyleId={ballotStyle.id}
          precinctId={precinct.id}
          ballotTemplateId={ballotTemplateId}
          closePath="/ballots"
          electionInfoPath="/election-info"
          renderActions={renderActions}
        />,
        {}
      )
    )
  );
}

test('shows a PDF ballot preview', async () => {
  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      variant: undefined,
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock ballot pdf'),
        fileName: 'mock ballot.pdf',
      })
    );
  renderViewer();

  await screen.findByRole('heading', { name: 'View Ballot' });
  screen.getByRole('button', { name: 'Close' });

  const document = screen.getByText('Mock Document').parentElement!;
  await within(document).findByText('mock ballot pdf');
  await within(document).findByText('Mock Page 1');
  await within(document).findByText('Mock Page 2');

  screen.getByText('Page: 1/2');
  screen.getByText('100%');

  const zoomInButton = screen.getByRole('button', { name: 'Zoom In' });
  await userEvent.click(zoomInButton);
  screen.getByText('125%');
  await userEvent.click(zoomInButton);
  screen.getByText('150%');
  await userEvent.click(zoomInButton);
  screen.getByText('175%');
  await userEvent.click(zoomInButton);
  screen.getByText('200%');
  await userEvent.click(zoomInButton);
  screen.getByText('200%');

  const zoomOutButton = screen.getByRole('button', { name: 'Zoom Out' });
  await userEvent.click(zoomOutButton);
  screen.getByText('175%');
  await userEvent.click(zoomOutButton);
  screen.getByText('150%');
  await userEvent.click(zoomOutButton);
  screen.getByText('125%');
  await userEvent.click(zoomOutButton);
  screen.getByText('100%');
  await userEvent.click(zoomOutButton);
  screen.getByText('75%');
  await userEvent.click(zoomOutButton);
  screen.getByText('50%');
  await userEvent.click(zoomOutButton);
  screen.getByText('25%');
  await userEvent.click(zoomOutButton);
  screen.getByText('25%');

  screen.getByText(ballotStyle.id);
  screen.getByText(precinct.name);
  screen.getByText('8.5 x 11 inches (Letter)');
});

test('changes ballot type', async () => {
  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      variant: undefined,
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock precinct ballot pdf'),
        fileName: 'mock precinct ballot.pdf',
      })
    );
  renderViewer();

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
      variant: undefined,
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock absentee ballot pdf'),
        fileName: 'mock absentee ballot.pdf',
      })
    );
  await userEvent.click(absenteeRadioOption);
  await screen.findByText('mock absentee ballot pdf');
  screen.getByRole('radio', { name: 'Absentee', checked: true });
});

test('changes tabulation mode', async () => {
  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      variant: undefined,
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock official ballot pdf'),
        fileName: 'mock official ballot.pdf',
      })
    );
  renderViewer();

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
      variant: undefined,
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock test ballot pdf'),
        fileName: 'mock test ballot.pdf',
      })
    );
  await userEvent.click(testRadioOption);
  await screen.findByText('mock test ballot pdf');
  screen.getByRole('radio', { name: 'L&A Test Ballot', checked: true });
});

test('NhStateBallot template: Federal Office Only option locks mode to Official', async () => {
  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      variant: undefined,
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock precinct ballot pdf'),
        fileName: 'mock precinct ballot.pdf',
      })
    );
  renderViewer('NhStateBallot');

  await screen.findByRole('heading', { name: 'View Ballot' });
  await screen.findByText('mock precinct ballot pdf');

  const ballotTypeRadioGroup = screen.getByRole('radiogroup', {
    name: 'Ballot Type',
  });
  const tabulationModeRadioGroup = screen.getByRole('radiogroup', {
    name: 'Tabulation Mode',
  });
  const fooRadioOption = within(ballotTypeRadioGroup).getByRole('radio', {
    name: 'Federal Office Only',
    checked: false,
  });
  const testRadioOption = within(tabulationModeRadioGroup).getByRole('radio', {
    name: 'L&A Test Ballot',
  });
  expect(testRadioOption).toBeEnabled();

  // Switch to test mode first so we can verify the FOO click forces it back to official.
  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
      variant: undefined,
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock test ballot pdf'),
        fileName: 'mock test ballot.pdf',
      })
    );
  await userEvent.click(testRadioOption);
  await screen.findByText('mock test ballot pdf');

  apiMock.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Absentee,
      ballotMode: 'official',
      variant: 'federalOfficeOnly',
    })
    .resolves(
      ok({
        pdfData: Buffer.from('mock foo ballot pdf'),
        fileName: 'mock foo ballot.pdf',
      })
    );
  await userEvent.click(fooRadioOption);
  await screen.findByText('mock foo ballot pdf');
  screen.getByRole('radio', { name: 'Federal Office Only', checked: true });
  expect(testRadioOption).toBeDisabled();
  within(tabulationModeRadioGroup).getByRole('radio', {
    name: 'Official Ballot',
    checked: true,
  });
});

describe('Ballot rendering error handling', () => {
  test('NH ballot template with missing signature shows appropriate error', async () => {
    // Mock the ballot preview API to return missing signature error
    apiMock.getBallotPreviewPdf
      .expectCallWith({
        electionId,
        ballotStyleId: ballotStyle.id,
        precinctId: precinct.id,
        ballotType: BallotType.Precinct,
        ballotMode: 'official',
        variant: undefined,
      })
      .resolves(
        err({
          error: 'missingSignature',
        })
      );

    renderViewer('NhBallot');

    await screen.findByText(/Missing signature. Upload a signature in/);
    expect(screen.getByRole('link', { name: 'Election Info' })).toHaveAttribute(
      'href',
      '/election-info'
    );
  });

  test.each<{
    name: string;
    ballotTemplateId: BallotTemplateId;
    contest: CandidateContest | YesNoContest;
    expectedMessage: string;
  }>([
    {
      name: 'candidate contest with default template',
      ballotTemplateId: 'VxDefaultBallot',
      contest: {
        id: 'long-contest',
        type: 'candidate',
        title: 'Very Long Contest',
        districtId: election.districts[0]!.id,
        seats: 1,
        allowWriteIns: false,
        candidates: [],
      },
      expectedMessage:
        'Contest "Very Long Contest" was too long to fit on the page. Try a longer paper size or higher density.',
    },
    {
      name: 'ballot measure with default template',
      ballotTemplateId: 'VxDefaultBallot',
      contest: {
        id: 'long-contest',
        type: 'yesno',
        title: 'Very Long Ballot Measure',
        districtId: election.districts[0]!.id,
        description: '',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
      },
      expectedMessage:
        'Contest "Very Long Ballot Measure" was too long to fit on the page. Try a longer paper size or higher density.',
    },
    {
      name: 'ballot measure with NH template',
      ballotTemplateId: 'NhBallot',
      contest: {
        id: 'long-contest',
        type: 'yesno',
        title: 'Very Long Ballot Measure',
        districtId: election.districts[0]!.id,
        description: '',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
      },
      expectedMessage:
        'Contest "Very Long Ballot Measure" was too long to fit on the page. Try a longer paper size, higher density, or adding a line break to the contest description.',
    },
    {
      name: 'MI template',
      ballotTemplateId: 'MiBallot',
      contest: {
        id: 'long-contest',
        type: 'candidate',
        title: 'Very Long Contest',
        districtId: election.districts[0]!.id,
        seats: 1,
        allowWriteIns: false,
        candidates: [],
      },
      expectedMessage:
        'Contest "Very Long Contest" was too long to fit on the page. Try a longer paper size.',
    },
  ])(
    'Contest too long error: $name',
    async ({ ballotTemplateId, contest, expectedMessage }) => {
      apiMock.getBallotPreviewPdf
        .expectCallWith({
          electionId,
          ballotStyleId: ballotStyle.id,
          precinctId: precinct.id,
          ballotType: BallotType.Precinct,
          ballotMode: 'official',
          variant: undefined,
        })
        .resolves(
          err({
            error: 'contestTooLong',
            contest,
          })
        );

      renderViewer(ballotTemplateId);

      await screen.findByText(expectedMessage);
    }
  );
});

test('renders the actions with the preview once it loads', async () => {
  const previewInput = {
    electionId,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    ballotType: BallotType.Precinct,
    ballotMode: 'official',
    variant: undefined,
  } as const;
  const { promise, resolve } =
    deferred<Result<BallotPreviewPdf, BallotLayoutError>>();
  apiMock.getBallotPreviewPdf.expectCallWith(previewInput).returns(promise);
  const renderActions = vi.fn(({ preview }: { preview?: BallotPreviewPdf }) => (
    <button type="button">Save {preview?.fileName ?? 'pending'}</button>
  ));
  renderViewer('VxDefaultBallot', renderActions);

  await screen.findButton('Save pending');
  const preview: BallotPreviewPdf = {
    pdfData: Buffer.from('mock ballot pdf'),
    fileName: 'proof.pdf',
  };
  resolve(ok(preview));
  await screen.findButton('Save proof.pdf');
  expect(renderActions).toHaveBeenLastCalledWith({
    previewInput,
    preview: expect.objectContaining({ fileName: 'proof.pdf' }),
  });
});
