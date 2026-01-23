import { expect, test } from 'vitest';
import { BallotStyle } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { sleep } from '@votingworks/basics';
import { createMemoryHistory } from 'history';
import { routes } from './routes';
import { withRoute } from '../test/routing_helpers';
import {
  createMockApiClient,
  MockApiClient,
  provideApi,
} from '../test/api_helpers';
import { render, screen, within } from '../test/react_testing_library';
import { BallotsStatus } from './ballots_status';

const electionId = 'election-1';

test('ballots incomplete', async () => {
  const api = createMockApiClient();
  mockBallotStyles(api, []);
  mockFinalizedAt(api, null);
  mockApprovedAt(api, null);

  renderUi(api);

  const soleHeading = await screen.findByRole('heading');
  api.assertComplete();

  expect(soleHeading).toHaveTextContent('Ballots Incomplete');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('ballots ready to finalize', async () => {
  const api = createMockApiClient();
  mockBallotStyles(api, [{} as unknown as BallotStyle]); // Content irrelevant.
  mockFinalizedAt(api, null);
  mockApprovedAt(api, null);

  renderUi(api);

  const soleHeading = await screen.findByRole('heading');
  api.assertComplete();

  expect(soleHeading).toHaveTextContent('Ballots Not Finalized');
  userEvent.click(screen.getButton(/finalize/i));
  const confirmModal = screen.getByRole('alertdialog');

  api.finalizeBallots.expectCallWith({ electionId }).resolves();
  mockFinalizedAt(api, new Date());
  mockApprovedAt(api, null);

  userEvent.click(within(confirmModal).getButton(/finalize/i));

  await sleep(0);
  api.assertComplete();
});

test('start finalize and cancel', async () => {
  const api = createMockApiClient();
  mockBallotStyles(api, [{} as unknown as BallotStyle]); // Content irrelevant.
  mockFinalizedAt(api, null);
  mockApprovedAt(api, null);

  renderUi(api);

  await screen.findByRole('heading', { name: 'Ballots Not Finalized' });
  api.assertComplete();

  userEvent.click(screen.getButton(/finalize/i));
  const confirmModal = screen.getByRole('alertdialog');

  userEvent.click(within(confirmModal).getButton(/cancel/i));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  api.assertComplete();
});

test('start finalize and confirm', async () => {
  const api = createMockApiClient();
  mockBallotStyles(api, [{} as unknown as BallotStyle]); // Content irrelevant.
  mockFinalizedAt(api, null);
  mockApprovedAt(api, null);

  renderUi(api);

  await screen.findByRole('heading', { name: 'Ballots Not Finalized' });
  api.assertComplete();

  userEvent.click(screen.getButton(/finalize/i));
  const confirmModal = screen.getByRole('alertdialog');

  api.finalizeBallots.expectCallWith({ electionId }).resolves();
  mockFinalizedAt(api, new Date());
  mockApprovedAt(api, null);

  userEvent.click(within(confirmModal).getButton(/finalize/i));

  await sleep(0);
  api.assertComplete();
});

test('ballots finalized', async () => {
  const api = createMockApiClient();
  mockBallotStyles(api, [{} as unknown as BallotStyle]); // Content irrelevant.
  mockFinalizedAt(api, new Date());
  mockApprovedAt(api, null);

  renderUi(api);

  const soleHeading = await screen.findByRole('heading');
  api.assertComplete();

  expect(soleHeading).toHaveTextContent('Ballots Finalized');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('ballots approved', async () => {
  const api = createMockApiClient();
  mockBallotStyles(api, [{} as unknown as BallotStyle]); // Content irrelevant.
  mockFinalizedAt(api, new Date());
  mockApprovedAt(api, new Date());

  const { history } = renderUi(api);

  const soleHeading = await screen.findByRole('heading');
  api.assertComplete();

  expect(soleHeading).toHaveTextContent('Ready for Download');
  const downloadsLink = screen.getButton(/downloads/i);

  userEvent.click(downloadsLink);

  const downloadsUrlPath = routes.election(electionId).downloads.path;
  expect(history.location.pathname).toEqual(downloadsUrlPath);
});

function mockApprovedAt(api: MockApiClient, date: Date | null) {
  api.getBallotsApprovedAt.expectCallWith({ electionId }).resolves(date);
}

function mockFinalizedAt(api: MockApiClient, date: Date | null) {
  api.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(date);
}

function mockBallotStyles(api: MockApiClient, styles: BallotStyle[]) {
  api.listBallotStyles.expectCallWith({ electionId }).resolves(styles);
}

function renderUi(api: MockApiClient) {
  const paramPath = routes.election(':electionId').ballots.root.path;
  const { path } = routes.election(electionId).ballots.root;
  const history = createMemoryHistory({ initialEntries: [path] });

  const result = render(
    provideApi(api, withRoute(<BallotsStatus />, { history, paramPath, path }))
  );

  return { history, result };
}
