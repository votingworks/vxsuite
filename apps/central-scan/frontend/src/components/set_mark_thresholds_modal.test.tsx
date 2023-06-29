import { electionSample } from '@votingworks/fixtures';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import {
  render,
  fireEvent,
  getByText as domGetByText,
  waitFor,
  screen,
} from '../../test/react_testing_library';

import { SetMarkThresholdsModal } from './set_mark_thresholds_modal';
import { MockApiClient, createMockApiClient, provideApi } from '../../test/api';

let mockApiClient: MockApiClient;

beforeEach(() => {
  jest.restoreAllMocks();
  mockApiClient = createMockApiClient();
});

afterEach(() => {
  mockApiClient.assertComplete();
});

function renderModal(
  props: Partial<React.ComponentProps<typeof SetMarkThresholdsModal>> = {},
  history = createMemoryHistory()
) {
  render(
    provideApi(
      mockApiClient,
      <Router history={history}>
        <SetMarkThresholdsModal
          onClose={jest.fn}
          markThresholds={electionSample.markThresholds}
          {...props}
        />
      </Router>
    )
  );
}

test('renders warning message before allowing overrides to be set', () => {
  const onClose = jest.fn();
  renderModal({ onClose });

  screen.getByText('Override Mark Thresholds');
  screen.getByText(/WARNING: Do not proceed/);
  userEvent.click(screen.getButton('Close'));
  expect(onClose).toHaveBeenCalled();
});

test('renders reset modal when overrides are set', async () => {
  const onClose = jest.fn();
  renderModal({
    onClose,
    markThresholdOverrides: { definite: 0.32, marginal: 0.24 },
  });
  screen.getByText('Reset Mark Thresholds');
  const currentThresholds = screen.getByText('Current Thresholds');
  domGetByText(currentThresholds, /Definite: 0.32/);
  domGetByText(currentThresholds, /Marginal: 0.24/);

  const defaultThresholds = screen.getByText('Default Thresholds');
  domGetByText(defaultThresholds, /Definite: 0.25/);
  domGetByText(defaultThresholds, /Marginal: 0.17/);

  userEvent.click(screen.getButton('Close'));
  expect(onClose).toHaveBeenCalled();

  mockApiClient.setMarkThresholdOverrides.expectCallWith({}).resolves();
  userEvent.click(screen.getButton('Reset Thresholds'));
  await screen.findByText('Loading');
  expect(onClose).toHaveBeenCalledTimes(2);
});

test('allows users to set thresholds properly', async () => {
  const onClose = jest.fn();
  renderModal({ onClose });

  screen.getByText('Override Mark Thresholds');
  screen.getByText(/WARNING: Do not proceed/);
  userEvent.click(screen.getButton('Proceed to Override Thresholds'));

  const definiteInput = screen
    .getByTestId('definite-text-input')
    .closest('input')!;
  expect(definiteInput.value).toEqual('0.25');
  fireEvent.change(definiteInput, { target: { value: '0.12' } });
  expect(definiteInput.value).toEqual('0.12');

  const marginalInput = screen
    .getByTestId('marginal-text-input')
    .closest('input')!;
  expect(marginalInput.value).toEqual('0.17');
  fireEvent.change(marginalInput, { target: { value: '0.21' } });
  expect(marginalInput.value).toEqual('0.21');

  mockApiClient.setMarkThresholdOverrides
    .expectCallWith({
      markThresholdOverrides: {
        definite: 0.12,
        marginal: 0.21,
      },
    })
    .resolves();
  userEvent.click(screen.getByText('Override Thresholds'));
  await waitFor(() => {
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

test('setting thresholds renders an error if given a non number', () => {
  const onClose = jest.fn();
  renderModal();
  screen.getByText('Override Mark Thresholds');
  screen.getByText(/WARNING: Do not proceed/);
  userEvent.click(screen.getButton('Proceed to Override Thresholds'));

  const definiteInput = screen
    .getByTestId('definite-text-input')
    .closest('input')!;
  fireEvent.change(definiteInput, { target: { value: 'giraffes' } });
  expect(definiteInput.value).toEqual('giraffes');

  userEvent.click(screen.getButton('Override Thresholds'));
  screen.getByText('Error');
  screen.getByText(/Inputted definite threshold invalid: giraffes./);
  expect(onClose).toHaveBeenCalledTimes(0);
});

test('setting thresholds renders an error if given a number greater than 1', () => {
  const onClose = jest.fn();
  renderModal();

  screen.getByText('Override Mark Thresholds');
  screen.getByText(/WARNING: Do not proceed/);
  userEvent.click(screen.getButton('Proceed to Override Thresholds'));

  const definiteInput = screen
    .getByTestId('definite-text-input')
    .closest('input')!;
  fireEvent.change(definiteInput, { target: { value: '314' } });
  expect(definiteInput.value).toEqual('314');

  userEvent.click(screen.getButton('Override Thresholds'));
  screen.getByText('Error');
  screen.getByText(/Inputted definite threshold invalid: 314./);
  expect(onClose).toHaveBeenCalledTimes(0);
});
