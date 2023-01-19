import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { electionSample } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import {
  SetMarkThresholdsModal,
  SetMarkThresholdsModalProps,
} from './set_mark_thresholds_modal';
import { createApiMock, provideApi } from '../../test/helpers/mock_api_client';

const apiMock = createApiMock();

beforeEach(() => {
  apiMock.mockApiClient.reset();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderModal(props?: Partial<SetMarkThresholdsModalProps>) {
  return render(
    provideApi(
      apiMock,
      <SetMarkThresholdsModal
        onClose={jest.fn()}
        markThresholds={electionSample.markThresholds}
        markThresholdOverrides={undefined}
        {...props}
      />
    )
  );
}

test('renders warning message before allowing overrides to be set', () => {
  const onClose = jest.fn();
  renderModal({ onClose });
  screen.getByText('Override Mark Thresholds');
  screen.getByText(/WARNING: Do not proceed/);
  userEvent.click(screen.getByText('Close'));
  expect(onClose).toHaveBeenCalled();
});

test('renders reset modal when overrides are set', async () => {
  apiMock.expectSetMarkThresholdOverrides(undefined);
  const onClose = jest.fn();
  renderModal({
    onClose,
    markThresholdOverrides: { definite: 0.32, marginal: 0.24 },
  });
  screen.getByText('Reset Mark Thresholds');
  const currentThresholds = screen.getByText('Current Thresholds');
  within(currentThresholds).getByText(/Definite: 0.32/);
  within(currentThresholds).getByText(/Marginal: 0.24/);

  const defaultThresholds = screen.getByText('Default Thresholds');
  within(defaultThresholds).getByText(/Definite: 0.25/);
  within(defaultThresholds).getByText(/Marginal: 0.17/);

  userEvent.click(screen.getByText('Close'));
  expect(onClose).toHaveBeenCalled();

  userEvent.click(screen.getByText('Reset Thresholds'));
  await waitFor(() => {
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

test('allows users to set thresholds properly', async () => {
  const onClose = jest.fn();
  apiMock.expectSetMarkThresholdOverrides({
    definite: 0.12,
    marginal: 0.21,
  });
  renderModal({ onClose });
  screen.getByText('Override Mark Thresholds');
  screen.getByText(/WARNING: Do not proceed/);
  userEvent.click(screen.getByText('Proceed to Override Thresholds'));

  const definiteInput = screen
    .getByTestId('definite-text-input')
    .closest('input')!;
  expect(definiteInput.value).toEqual('0.25');
  userEvent.clear(definiteInput);
  userEvent.type(definiteInput, '0.12');
  expect(definiteInput.value).toEqual('0.12');

  const marginalInput = screen
    .getByTestId('marginal-text-input')
    .closest('input')!;
  expect(marginalInput.value).toEqual('0.17');
  userEvent.clear(marginalInput);
  userEvent.type(marginalInput, '0.21');
  expect(marginalInput.value).toEqual('0.21');

  userEvent.click(screen.getByText('Override Thresholds'));
  await waitFor(() => {
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

test('setting thresholds renders an error if given a number greater than 1', () => {
  const onClose = jest.fn();
  renderModal();
  screen.getByText('Override Mark Thresholds');
  screen.getByText(/WARNING: Do not proceed/);
  userEvent.click(screen.getByText('Proceed to Override Thresholds'));

  const definiteInput = screen
    .getByTestId('definite-text-input')
    .closest('input')!;
  userEvent.clear(definiteInput);
  userEvent.type(definiteInput, '314');
  expect(definiteInput.value).toEqual('314');

  userEvent.click(screen.getByText('Override Thresholds'));
  screen.getByText('Error');
  screen.getByText(/Inputted definite threshold invalid: 314./);
  expect(onClose).toHaveBeenCalledTimes(0);
});
