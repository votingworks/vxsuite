import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import type { ElectricalTestingApi } from '@votingworks/scan-backend';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render as renderBase, screen } from '../../test/react_testing_library';
import { ApiClientContext } from './api';
import { SheetImagesModal } from './sheet_images_modal';

let queryClient: QueryClient;
let mockClient: MockClient<ElectricalTestingApi>;

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient();
  mockClient = createMockClient<ElectricalTestingApi>();
});

afterEach(() => {
  mockClient.assertComplete();
});

function render(element: React.ReactElement) {
  renderBase(
    <QueryClientProvider client={queryClient}>
      <ApiClientContext.Provider value={mockClient}>
        {element}
      </ApiClientContext.Provider>
    </QueryClientProvider>
  );
}

test('closes on click', async () => {
  const onClose = vi.fn();

  render(
    <SheetImagesModal
      paths={['/api/images/front.jpeg', '/api/images/back.jpeg']}
      onClose={onClose}
    />
  );

  await screen.findByRole('alertdialog');
  const presentation = await screen.findByRole('presentation');
  userEvent.click(presentation);
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
});

test('shows an image for each page', async () => {
  const onClose = vi.fn();

  render(
    <SheetImagesModal
      paths={['/api/images/front.jpeg', '/api/images/back.jpeg']}
      onClose={onClose}
    />
  );

  await screen.findByRole('alertdialog');
  expect(await screen.findAllByRole('img')).toHaveLength(2);
});
