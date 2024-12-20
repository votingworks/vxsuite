import { suppressingConsoleOutput } from '@votingworks/test-utils';
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
    const logger = mockBaseLogger({ fn: jest.fn });
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

test('AppErrorBoundary shows "Something went wrong" when something goes wrong', async () => {
  const logger = mockBaseLogger({ fn: jest.fn });
  await suppressingConsoleOutput(async () => {
    render(
      <AppErrorBoundary
        restartMessage="Please restart the machine."
        logger={logger}
      >
        <ThrowError />
      </AppErrorBoundary>
    );
    await screen.findByText('Something went wrong');
    await screen.findByText('Please restart the machine.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(logger.log).toHaveBeenCalled();
  });
});
