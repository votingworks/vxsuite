import { test, beforeEach, afterEach, vi, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { Anomaly } from '@votingworks/pollbook-backend';
import { screen, waitFor } from '../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';
import { AnomalyAlertScreen } from './anomaly_alert_screen';
import { renderInAppContext } from '../test/render_in_app_context';

let apiMock: ApiMock;
let unmount: () => void;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  vi.clearAllMocks();
  if (unmount) {
    unmount();
  }
  vi.useRealTimers();
});

function createMockAnomaly(overrides: Partial<Anomaly> = {}): Anomaly {
  const mockVoter = createMockVoter('voter-123', 'John', 'Doe');
  return {
    anomalyId: 1,
    anomalyType: 'DuplicateCheckIn',
    detectedAt: new Date('2025-01-01T10:00:00Z'),
    anomalyDetails: {
      voterId: 'voter-123',
      voter: mockVoter,
      checkInEvents: [
        {
          machineId: 'machine-1',
          timestamp: '2025-01-01T09:30:00Z',
        },
        {
          machineId: 'machine-2',
          timestamp: '2025-01-01T09:35:00Z',
        },
      ],
    },
    dismissed: false,
    ...overrides,
  };
}

test('renders duplicate check-in anomaly with voter details', async () => {
  const anomaly = createMockAnomaly();

  const result = renderInAppContext(<AnomalyAlertScreen anomaly={anomaly} />, {
    apiMock,
  });
  unmount = result.unmount;

  // Check title is displayed
  await screen.findByText('Duplicate Check-In Detected');

  // Check voter details are displayed
  expect(screen.getByText('voter-123')).toBeInTheDocument();
  expect(screen.getByText('John Doe')).toBeInTheDocument();

  // Check the check-in records section
  expect(screen.getByText('Check-In Records')).toBeInTheDocument();
});

test('displays check-in events table with machine IDs', async () => {
  const anomaly = createMockAnomaly();

  const result = renderInAppContext(<AnomalyAlertScreen anomaly={anomaly} />, {
    apiMock,
  });
  unmount = result.unmount;

  // Wait for component to render
  await screen.findByText('Duplicate Check-In Detected');

  // Check table headers
  expect(screen.getByText('Machine ID')).toBeInTheDocument();
  expect(screen.getByText('Check-In Time')).toBeInTheDocument();

  // Check machine IDs are displayed in the table
  expect(screen.getByText('machine-1')).toBeInTheDocument();
  expect(screen.getByText('machine-2')).toBeInTheDocument();
});

test('displays voter with middle name and suffix correctly', async () => {
  const mockVoter = createMockVoter('voter-456', 'Jane', 'Smith');
  mockVoter.middleName = 'Marie';
  mockVoter.suffix = 'Jr';

  const anomaly = createMockAnomaly({
    anomalyDetails: {
      voterId: 'voter-456',
      voter: mockVoter,
      checkInEvents: [
        {
          machineId: 'machine-1',
          timestamp: '2025-01-01T09:30:00Z',
        },
      ],
    },
  });

  const result = renderInAppContext(<AnomalyAlertScreen anomaly={anomaly} />, {
    apiMock,
  });
  unmount = result.unmount;

  await screen.findByText('Duplicate Check-In Detected');

  // Check full name with middle name and suffix is displayed
  expect(screen.getByText('Jane Marie Smith Jr')).toBeInTheDocument();
});

test('clicking Acknowledge button dismisses the anomaly', async () => {
  const anomaly = createMockAnomaly();

  apiMock.expectDismissAnomaly(anomaly.anomalyId);

  const result = renderInAppContext(<AnomalyAlertScreen anomaly={anomaly} />, {
    apiMock,
  });
  unmount = result.unmount;

  await screen.findByText('Duplicate Check-In Detected');

  const acknowledgeButton = screen.getByRole('button', { name: 'Dismiss' });
  expect(acknowledgeButton).toBeInTheDocument();

  userEvent.click(acknowledgeButton);

  // Wait for the mutation to be called
  await waitFor(() => {
    apiMock.mockApiClient.assertComplete();
  });
});

test('displays instructional message about duplicate check-ins', async () => {
  const anomaly = createMockAnomaly();

  const result = renderInAppContext(<AnomalyAlertScreen anomaly={anomaly} />, {
    apiMock,
  });
  unmount = result.unmount;

  await screen.findByText('Duplicate Check-In Detected');

  // Check the instructional message is displayed
  expect(
    screen.getByText('This voter was checked in more than once.')
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Only one check-in for this voter will count/)
  ).toBeInTheDocument();
});

test('renders InvalidRegistrationCheckIn anomaly correctly', async () => {
  const mockVoter = createMockVoter('voter-invalid', 'Invalid', 'Registration');
  const anomaly: Anomaly = {
    anomalyId: 2,
    anomalyType: 'InvalidRegistrationCheckIn',
    detectedAt: new Date('2025-01-01T10:00:00Z'),
    anomalyDetails: {
      voterId: 'voter-invalid',
      voter: mockVoter,
      checkInEvents: [
        {
          machineId: 'machine-1',
          timestamp: '2025-01-01T09:30:00Z',
        },
      ],
    },
    dismissed: false,
  };

  const result = renderInAppContext(<AnomalyAlertScreen anomaly={anomaly} />, {
    apiMock,
  });
  unmount = result.unmount;

  // Check title is displayed
  await screen.findByText('Check-In for Invalid Registration');

  // Check voter details are displayed
  expect(screen.getByText('voter-invalid')).toBeInTheDocument();
  expect(screen.getByText('Invalid Registration')).toBeInTheDocument();

  // Check the instructional message is displayed
  expect(
    screen.getByText(
      /A check in was detected for a voter registration that has been marked as invalid/
    )
  ).toBeInTheDocument();
  expect(screen.getByText(/The check in will be counted/)).toBeInTheDocument();

  // Check machine ID is displayed in the table
  expect(screen.getByText('machine-1')).toBeInTheDocument();
});

test('clicking Dismiss button dismisses InvalidRegistrationCheckIn anomaly', async () => {
  const mockVoter = createMockVoter('voter-invalid', 'Invalid', 'Registration');
  const anomaly: Anomaly = {
    anomalyId: 3,
    anomalyType: 'InvalidRegistrationCheckIn',
    detectedAt: new Date('2025-01-01T10:00:00Z'),
    anomalyDetails: {
      voterId: 'voter-invalid',
      voter: mockVoter,
      checkInEvents: [
        {
          machineId: 'machine-1',
          timestamp: '2025-01-01T09:30:00Z',
        },
      ],
    },
    dismissed: false,
  };

  apiMock.expectDismissAnomaly(anomaly.anomalyId);

  const result = renderInAppContext(<AnomalyAlertScreen anomaly={anomaly} />, {
    apiMock,
  });
  unmount = result.unmount;

  await screen.findByText('Check-In for Invalid Registration');

  const dismissButton = screen.getByRole('button', { name: 'Dismiss' });
  expect(dismissButton).toBeInTheDocument();

  userEvent.click(dismissButton);

  // Wait for the mutation to be called
  await waitFor(() => {
    apiMock.mockApiClient.assertComplete();
  });
});
