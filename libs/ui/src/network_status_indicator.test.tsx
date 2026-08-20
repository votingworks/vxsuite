import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';

import {
  NetworkIndicatorStatus,
  NetworkStatusIndicator,
} from './network_status_indicator';

const testCases: Array<{
  status: NetworkIndicatorStatus;
  expectedLabel: string;
  expectedTreatment: 'connected' | 'warning' | 'error';
}> = [
  {
    status: 'connected',
    expectedLabel: 'Connected',
    expectedTreatment: 'connected',
  },
  {
    status: 'no-host-connected',
    expectedLabel: 'No VxAdmin Connected',
    expectedTreatment: 'warning',
  },
  {
    status: 'no-network',
    expectedLabel: 'No Network',
    expectedTreatment: 'warning',
  },
  {
    status: 'error',
    expectedLabel: 'Network Error',
    expectedTreatment: 'error',
  },
];

test.each(testCases)(
  'renders $status',
  ({ status, expectedLabel, expectedTreatment }) => {
    const { unmount } = render(<NetworkStatusIndicator status={status} />);
    const indicator = screen.getByTestId('network-status');
    expect(indicator).toHaveTextContent(expectedLabel);
    switch (expectedTreatment) {
      // Connected states show the plain network icon
      case 'connected':
        expect(
          indicator.querySelector(`[data-icon='sitemap']`)
        ).toBeInTheDocument();
        expect(indicator.querySelectorAll('[data-icon]')).toHaveLength(1);
        expect(
          indicator.querySelector(`[data-testid='network-off-icon']`)
        ).not.toBeInTheDocument();
        break;
      // Warning states show the slashed network icon
      case 'warning':
        expect(
          indicator.querySelector(`[data-testid='network-off-icon']`)
        ).toBeInTheDocument();
        expect(indicator.querySelectorAll('[data-icon]')).toHaveLength(0);
        break;
      // Error states show the slashed network icon with a danger icon next
      // to it
      case 'error':
        expect(
          indicator.querySelector(`[data-testid='network-off-icon']`)
        ).toBeInTheDocument();
        expect(
          indicator.querySelector(`[data-icon='circle-exclamation']`)
        ).toBeInTheDocument();
        break;
      /* istanbul ignore next - compile-time check */
      default:
        throw new Error('unreachable');
    }
    unmount();
  }
);

test('host machines label the connected state as network online', () => {
  render(<NetworkStatusIndicator isHost status="connected" />);
  const indicator = screen.getByTestId('network-status');
  expect(indicator).toHaveTextContent('Network Online');
  expect(indicator.querySelector(`[data-icon='sitemap']`)).toBeInTheDocument();
});

test('calls onPress when clicked', () => {
  const onPress = vi.fn();
  render(<NetworkStatusIndicator status="connected" onPress={onPress} />);
  userEvent.click(screen.getByTestId('network-status'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
