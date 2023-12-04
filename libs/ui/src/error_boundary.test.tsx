import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { LogEventId, fakeLogger } from '@votingworks/logging';
import { render, screen } from '../test/react_testing_library';
import { ErrorBoundary, TestErrorBoundary } from './error_boundary';

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
  expectedLog: { errorMessage: string; errorStack?: string };
}>([
  {
    error: new Error('Whoa!'),
    expectedLog: {
      errorMessage: 'Whoa!',
      errorStack: expect.stringContaining('Whoa!'),
    },
  },
  {
    error: 42,
    expectedLog: {
      errorMessage: '42',
      errorStack: undefined,
    },
  },
])(
  'logs error if logger is provided - $error',
  async ({ error, expectedLog }) => {
    const logger = fakeLogger();
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
