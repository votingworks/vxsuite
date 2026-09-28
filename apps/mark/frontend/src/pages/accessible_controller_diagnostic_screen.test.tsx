import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { MARK_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME } from '@votingworks/ui';
import { fireEvent, render, screen } from '../../test/react_testing_library.js';
import {
  type ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client.js';
import {
  AccessibleControllerDiagnosticScreen,
  DIAGNOSTIC_STEPS,
} from './accessible_controller_diagnostic_screen.js';

let apiMock: ApiMock;
let onComplete: () => void;
let onCancel: () => void;

beforeEach(() => {
  onComplete = vi.fn();
  onCancel = vi.fn();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen() {
  render(
    provideApi(
      apiMock,
      <AccessibleControllerDiagnosticScreen
        onComplete={onComplete}
        onCancel={onCancel}
      />
    )
  );
}

const ILLUSTRATION_TEST_IDS = [
  'up',
  'down',
  'left',
  'right',
  'select',
  'volume-up',
  'volume-down',
  'pause',
  'help',
];

test('passes after each button is pressed in order', async () => {
  renderScreen();

  for (const [index, step] of DIAGNOSTIC_STEPS.entries()) {
    await screen.findByText(
      `${index + 1}. Press the ${step.label.toLowerCase()} button.`
    );
    screen.getByText(`Step ${index + 1} of ${DIAGNOSTIC_STEPS.length}`);
    expect(
      screen.getByTestId(assertDefined(ILLUSTRATION_TEST_IDS[index]))
    ).toHaveClass(MARK_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME);

    if (index === DIAGNOSTIC_STEPS.length - 1) {
      apiMock.expectAddDiagnosticRecord({
        type: 'mark-accessible-controller',
        outcome: 'pass',
      });
    }
    fireEvent.keyDown(document, { key: step.key });
  }

  await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  expect(onCancel).not.toHaveBeenCalled();
});

test('ignores presses of the wrong button', async () => {
  renderScreen();

  await screen.findByText('1. Press the up button.');
  fireEvent.keyDown(document, {
    key: assertDefined(DIAGNOSTIC_STEPS[1]).key,
  });
  screen.getByText('1. Press the up button.');
});

test('fails when a button is reported not working', async () => {
  renderScreen();

  fireEvent.keyDown(document, {
    key: assertDefined(DIAGNOSTIC_STEPS[0]).key,
  });
  await screen.findByText('2. Press the down button.');

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-accessible-controller',
    outcome: 'fail',
    message: 'down button is not working.',
  });
  userEvent.click(
    screen.getByRole('button', { name: 'Down Button is Not Working' })
  );

  await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
});

test('cancel', async () => {
  renderScreen();

  userEvent.click(await screen.findByRole('button', { name: 'Cancel Test' }));

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});
