import { expect, test } from 'vitest';
import type { NetworkConnectionInfo } from '@votingworks/central-scan-backend';
import { makeTheme } from '@votingworks/ui';
import { renderInAppContext } from '../../test/render_in_app_context.js';
import { createApiMock } from '../../test/api.js';
import { screen, waitFor } from '../../test/react_testing_library.js';
import { NetworkStatusIndicator } from './network_status_indicator.js';

const DANGER_COLOR = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' })
  .colors.inverseDangerAccent;

test('renders nothing when networking is disabled', async () => {
  const apiMock = createApiMock();
  const { container } = renderInAppContext(<NetworkStatusIndicator />, {
    apiMock,
  });
  await waitFor(() =>
    expect(apiMock.apiClient.getNetworkStatus).toHaveBeenCalled()
  );
  expect(container).toBeEmptyDOMElement();
});

const testCases: Array<{
  connection: NetworkConnectionInfo;
  expectedLabel: string;
  expectedTreatment: 'connected' | 'warning' | 'error';
}> = [
  {
    connection: { status: 'offline' },
    expectedLabel: 'No Network',
    expectedTreatment: 'warning',
  },
  {
    connection: { status: 'online-waiting-for-host' },
    expectedLabel: 'No VxAdmin Connected',
    expectedTreatment: 'warning',
  },
  {
    connection: {
      status: 'online-machine-unconfigured',
      hostMachineId: '0002',
    },
    expectedLabel: 'No VxAdmin Connected',
    expectedTreatment: 'warning',
  },
  {
    connection: { status: 'online-host-unconfigured', hostMachineId: '0002' },
    expectedLabel: 'No VxAdmin Connected',
    expectedTreatment: 'warning',
  },
  {
    connection: {
      status: 'online-ballot-hash-mismatch',
      hostMachineId: '0002',
    },
    expectedLabel: 'No VxAdmin Connected',
    expectedTreatment: 'warning',
  },
  // Refusals explained on the Scan Ballots screen read as connected here
  {
    connection: { status: 'online-results-official', hostMachineId: '0002' },
    expectedLabel: 'Connected',
    expectedTreatment: 'connected',
  },
  {
    connection: {
      status: 'online-invalid-mode',
      hostMachineId: '0002',
      hostCvrFileMode: 'official',
    },
    expectedLabel: 'Connected',
    expectedTreatment: 'connected',
  },
  {
    connection: { status: 'online-multiple-hosts-detected' },
    expectedLabel: 'Network Error',
    expectedTreatment: 'error',
  },
  {
    connection: {
      status: 'online-code-version-mismatch',
      hostMachineId: '0002',
    },
    expectedLabel: 'Network Error',
    expectedTreatment: 'error',
  },
  {
    connection: {
      status: 'online-host-detected',
      hostMachineId: '0002',
      hostAddress: 'http://169.254.10.20:3002',
    },
    expectedLabel: 'Connected',
    expectedTreatment: 'connected',
  },
];

test.each(testCases)(
  'renders $connection.status',
  async ({ connection, expectedLabel, expectedTreatment }) => {
    const apiMock = createApiMock();
    apiMock.setNetworkStatus({ isEnabled: true, connection });
    const { unmount } = renderInAppContext(<NetworkStatusIndicator />, {
      apiMock,
    });
    const indicator = await screen.findByTestId('network-status');
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
      default:
        throw new Error('unreachable');
    }
    unmount();
  }
);
