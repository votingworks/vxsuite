import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { render, screen } from '../test/react_testing_library';
import { ErrorBoundary } from './error_boundary';

test('renders error when there is an error', async () => {
  function ThrowError(): JSX.Element {
    throw new Error('error');
  }
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
