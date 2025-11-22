import { beforeEach, expect, test, vi } from 'vitest';
import { mockKiosk, suppressingConsoleOutput } from '@votingworks/test-utils';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { render, screen } from '../test/react_testing_library';
import {
  AppErrorBoundary,
  ErrorBoundary,
  TestErrorBoundary,
} from './error_boundary';

function ThrowError({ error }: { error?: unknown }): JSX.Element {
  throw error ?? new Error('Whoa!');
}

vi.useFakeTimers({ shouldAdvanceTime: true });

beforeEach(() => {
  window.kiosk = mockKiosk(vi.fn);
});

test('renders error when there is an error', async () => {
  await suppressingConsoleOutput(async () => {
    render(
      <ErrorBoundary errorMessage="jellyfish">
        <ThrowError />
      </ErrorBoundary>
    );
    await screen.findByText('jellyfish');
  });
});

test('renders children when there is no error', async () => {
  render(<ErrorBoundary errorMessage="jellyfish">kangaroo</ErrorBoundary>);
  await screen.findByText('kangaroo');
  expect(screen.queryAllByText('jellyfish')).toHaveLength(0);
});

test.each<{
  error: unknown;
  expectedLog: {
    message: string;
    stack?: string;
    disposition: string;
  };
}>([
  {
    error: new Error('Whoa!'),
    expectedLog: {
      message: 'Whoa!',
      stack: expect.stringContaining('Whoa!'),
      disposition: 'failure',
    },
  },
  {
    error: 42,
    expectedLog: {
      message: '42',
      stack: undefined,
      disposition: 'failure',
    },
  },
])(
  'logs error if logger is provided - $error',
  async ({ error, expectedLog }) => {
    const logger = mockBaseLogger({ fn: vi.fn });
    await suppressingConsoleOutput(async () => {
      render(
        <ErrorBoundary errorMessage="jellyfish" logger={logger}>
          <ThrowError error={error} />
        </ErrorBoundary>
      );
      await screen.findByText('jellyfish');
    });
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.UnknownError,
      'system',
      expectedLog
    );
  }
);

test('TestErrorBoundary shows caught error message', async () => {
  await suppressingConsoleOutput(async () => {
    render(
      <TestErrorBoundary>
        <ThrowError />
      </TestErrorBoundary>
    );
    await screen.findByText('Test Error Boundary');
    screen.getByText('Error: Whoa!');
  });
});

test('AppErrorBoundary with default text', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  await suppressingConsoleOutput(async () => {
    render(
      <AppErrorBoundary logger={logger}>
        <ThrowError />
      </AppErrorBoundary>
    );

    await screen.findByText('Something went wrong');
    screen.getByText('Please restart the machine.');
    screen.getByText(
      'If problems persist after restarting, ask your election official to contact VotingWorks support.'
    );
    expect(logger.log).toHaveBeenCalledTimes(1);
  });
});

test('AppErrorBoundary with custom text', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  await suppressingConsoleOutput(async () => {
    render(
      <AppErrorBoundary
        logger={logger}
        primaryMessage="Please spin in 3 circles and restart the machine."
        secondaryMessage="If the problem persists after restarting, spin in 4 circles and restart the machine."
      >
        <ThrowError />
      </AppErrorBoundary>
    );

    await screen.findByText('Something went wrong');
    screen.getByText('Please spin in 3 circles and restart the machine.');
    screen.getByText(
      'If the problem persists after restarting, spin in 4 circles and restart the machine.'
    );
    expect(logger.log).toHaveBeenCalledTimes(1);
  });
});

test('AppErrorBoundary with auto restart enabled', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  await suppressingConsoleOutput(async () => {
    render(
      <AppErrorBoundary autoRestartInSeconds={10} logger={logger}>
        <ThrowError />
      </AppErrorBoundary>
    );

    await screen.findByText('Something went wrong');
    expect(logger.log).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10 * 1000 + 1);
    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.RebootMachine,
      'system',
      { message: 'Automatic restart initiated after waiting 10 seconds' }
    );
    expect(window.kiosk?.reboot).toHaveBeenCalled();
  });
});

test('AppErrorBoundary without auto restart enabled', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  await suppressingConsoleOutput(async () => {
    render(
      <AppErrorBoundary logger={logger}>
        <ThrowError />
      </AppErrorBoundary>
    );

    await screen.findByText('Something went wrong');
    expect(logger.log).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(window.kiosk?.reboot).not.toHaveBeenCalled();
  });
});
