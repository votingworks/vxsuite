import { expect, test, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  AamvaDocument,
  Voter,
  VoterSearchParams,
} from '@votingworks/pollbook-backend';
import {
  ApiMock,
  createApiMock,
  createMockVoter,
} from '../test/mock_api_client';
import { renderInAppContext } from '../test/render_in_app_context';
import {
  act,
  getDefaultNormalizer,
  screen,
} from '../test/react_testing_library';
import { createEmptySearchParams, VoterSearch } from './voter_search_screen';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from './api';

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

test('shows a message when no voters are matched', async () => {
  apiMock.expectGetScannedIdDocument();
  apiMock.expectSearchVotersWithResults({}, []);

  const result = renderInAppContext(
    <VoterSearch
      search={createEmptySearchParams(false)}
      setSearch={vi.fn()}
      // Function to call when exactly one voter is matched by scanning an ID
      onBarcodeScanMatch={vi.fn()}
      renderAction={() => null}
    />,
    {
      apiMock,
    }
  );
  unmount = result.unmount;

  await act(() => vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL));

  await screen.findByText('No voters matched.');
});

test('shows a message when the barcode scanner client reports an unknown document type', async () => {
  apiMock.expectGetScannedIdDocumentUnknownType();
  apiMock.expectSearchVotersNull({});

  const result = renderInAppContext(
    <VoterSearch
      search={createEmptySearchParams(false)}
      setSearch={vi.fn()}
      onBarcodeScanMatch={vi.fn()}
      renderAction={() => null}
    />,
    {
      apiMock,
    }
  );
  unmount = result.unmount;

  await act(() => vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL));

  await screen.findByRole('heading', { name: 'ID Not Recognized' });
  screen.getByText(
    'Unable to read the scanned barcode. Please try scanning again or enter the name manually.'
  );
  userEvent.click(screen.getButton('Close'));

  // Recommended pattern per github.com/vitest-dev/vitest/discussions/6560
  await expect
    .poll(() => screen.queryByRole('heading', { name: 'ID Not Recognized' }))
    .not.toBeInTheDocument();
});

test('closes the error modal if a valid ID is scanned', async () => {
  apiMock.expectGetScannedIdDocumentUnknownType();
  apiMock.expectSearchVotersNull({});

  const setSearchSpy = vi.fn();
  const result = renderInAppContext(
    <VoterSearch
      search={createEmptySearchParams(false)}
      setSearch={setSearchSpy}
      onBarcodeScanMatch={vi.fn()}
      renderAction={() => null}
    />,
    {
      apiMock,
    }
  );
  unmount = result.unmount;

  await act(() => vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL));

  await screen.findByRole('heading', { name: 'ID Not Recognized' });
  screen.getByText(
    'Unable to read the scanned barcode. Please try scanning again or enter the name manually.'
  );

  const document: AamvaDocument = {
    firstName: 'Aaron',
    middleName: 'Danger',
    lastName: 'Burr',
    nameSuffix: 'Jr',
    issuingJurisdiction: 'NH',
  };
  const searchParams: VoterSearchParams = {
    firstName: document.firstName,
    middleName: document.middleName,
    lastName: document.lastName,
    suffix: document.nameSuffix,
    exactMatch: true,
  };
  const mockVoter: Voter = {
    ...createMockVoter('123', document.firstName, document.lastName),
    middleName: document.middleName,
    suffix: document.nameSuffix,
  };

  apiMock.expectSearchVotersWithResults(searchParams, [mockVoter]);
  apiMock.expectGetScannedIdDocument(document);

  await act(() => vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL));

  // Recommended pattern to check for element absence per github.com/vitest-dev/vitest/discussions/6560
  await expect
    .poll(() => screen.queryByRole('heading', { name: 'ID Not Recognized' }))
    .not.toBeInTheDocument();

  expect(setSearchSpy).toHaveBeenCalledWith(searchParams);
  expect(
    screen.getByText('Burr, Aaron Danger Jr', {
      normalizer: getDefaultNormalizer({ collapseWhitespace: true }),
    })
  ).toBeInTheDocument();
});

// Test for barcode scanner happy path is covered in app_poll_worker_screen.test.tsx
