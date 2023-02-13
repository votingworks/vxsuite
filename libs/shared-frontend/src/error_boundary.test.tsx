import React from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './error_boundary';

test('renders error when there is an error', async () => {
  function ThrowError(): JSX.Element {
    throw new Error('error');
  }
  jest.spyOn(console, 'error').mockReturnValue();
  render(
    <ErrorBoundary errorMessage="jellyfish">
      <ThrowError />
    </ErrorBoundary>
  );
  await screen.findByText('jellyfish');
});

test('renders children when there is no error', async () => {
  render(<ErrorBoundary errorMessage="jellyfish">Kangaroo</ErrorBoundary>);
  await screen.findByText('Kangaroo');
  expect(screen.queryAllByText('jellyfish')).toHaveLength(0);
});
