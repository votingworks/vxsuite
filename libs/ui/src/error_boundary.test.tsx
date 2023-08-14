import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { render, screen } from '../test/react_testing_library';
import { ErrorBoundary, TestErrorBoundary } from './error_boundary';

function ThrowError(): JSX.Element {
  throw new Error('this is an error');
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
  render(<ErrorBoundary errorMessage="jellyfish">Kangaroo</ErrorBoundary>);
  await screen.findByText('Kangaroo');
  expect(screen.queryAllByText('jellyfish')).toHaveLength(0);
});

test('TestErrorBoundary shows caught error message', async () => {
  await suppressingConsoleOutput(async () => {
    render(
      <TestErrorBoundary>
        <ThrowError />
      </TestErrorBoundary>
    );
    await screen.findByText('Test Error Boundary');
    screen.getByText('Error: this is an error');
  });
});
