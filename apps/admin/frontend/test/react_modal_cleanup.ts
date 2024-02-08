import { waitFor } from '@testing-library/react';
import { screen } from './react_testing_library';

/**
 * HACK: The modal library we're using applies an `aria-hidden` attribute
 * to the root element when a modal is open and removes it when the modal
 * is closed, but this isn't happening in the jest environment, for some
 * reason. Works as expected in production.
 * We're removing the attribute here to make sure our getByRole queries work
 * properly.
 */
export async function hackActuallyCleanUpReactModal(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  window.document.body.firstElementChild?.removeAttribute('aria-hidden');
}
