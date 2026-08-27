import { expect, test } from 'vitest';
import { render, screen } from '../test/react_testing_library.js';

import {
  NetworkIndicatorStatus,
  NetworkStatusIndicator,
} from './network_status_indicator.js';
import { makeTheme } from './themes/make_theme.js';

const THEME = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' });
const DANGER_COLOR = THEME.colors.inverseDangerAccent;

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
    const { unmount } = render(<NetworkStatusIndicator status={status} />, {
      vxTheme: { colorMode: 'desktop', sizeMode: 'desktop' },
    });
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
          indicator.querySelector(`[data-icon='network-off']`)
        ).not.toBeInTheDocument();
        break;
      // Warning states show the slashed network icon
      case 'warning':
        expect(
          indicator.querySelector(`[data-icon='network-off']`)
        ).toBeInTheDocument();
        expect(indicator.querySelectorAll('[data-icon]')).toHaveLength(1);
        break;
      // Error states show the slashed network icon in the danger color
      case 'error': {
        const icon = indicator.querySelector(`[data-icon='network-off']`);
        expect(icon).toBeInTheDocument();
        expect(indicator.querySelectorAll('[data-icon]')).toHaveLength(1);
        expect(icon).toHaveStyle(`color: ${DANGER_COLOR}`);
        break;
      }
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

test('is not interactive', () => {
  render(<NetworkStatusIndicator status="connected" />);
  expect(screen.getByTestId('network-status').tagName).not.toEqual('BUTTON');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
