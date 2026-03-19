import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '../test/react_testing_library.js';
import { newTestContext } from '../test/test_context.js';
import { PowerDownButton } from './power_down_button.js';

const { mockApiClient, render } = newTestContext({
  skipUiStringsApi: true,
});

test('renders as expected.', async () => {
  render(<PowerDownButton />);

  userEvent.click(screen.getByText('Power Down'));
  await screen.findByText(/Powering Down/);
  await waitFor(() => expect(mockApiClient.powerDown).toHaveBeenCalledTimes(1));
});
