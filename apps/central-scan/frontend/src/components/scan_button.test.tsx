import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { ScanButton } from './scan_button';
import { ApiMock, createApiMock } from '../../test/api';
import { renderInAppContext } from '../../test/render_in_app_context';

let apiMock: ApiMock;

beforeEach(() => {
  vi.restoreAllMocks();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('is enabled by default', async () => {
  renderInAppContext(<ScanButton />, { apiMock });
  const button = await screen.findButton('Scan New Batch');
  expect(button).toBeEnabled();
});

test('is disabled when disabled set to true', async () => {
  renderInAppContext(<ScanButton disabled />, { apiMock });
  const button = await screen.findButton('Scan New Batch');
  expect(button).toBeDisabled();
});

test('calls scanBatch', async () => {
  renderInAppContext(<ScanButton />, { apiMock });
  apiMock.expectScanBatch();
  userEvent.click(await screen.findButton('Scan New Batch'));
});
