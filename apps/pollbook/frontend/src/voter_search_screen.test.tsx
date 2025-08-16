import { expect, test, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  AamvaDocument,
  VoterSearchParams,
} from '@votingworks/pollbook-backend';
import { electionSimpleSinglePrecinctFixtures } from '@votingworks/fixtures';
import { Voter } from '@votingworks/types';
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
import {
  createEmptySearchParams,
  validateUsState,
  VoterSearch,
} from './voter_search_screen';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from './api';
import {
  getMockAamvaDocument,
  getMockExactSearchParams,
} from '../test/aamva_fixtures';

let apiMock: ApiMock;
let unmount: () => void;
const election = electionSimpleSinglePrecinctFixtures.readElection();

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
      election={election}
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
      election={election}
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

test('after an ID scan with "hidden" fields, shows full name and "Edit Search" button', async () => {
  const mockDocument = getMockAamvaDocument();
  const mockSearchParams = getMockExactSearchParams();
  // Voter who exactly matches the scanned ID
  const mockVoter: Voter = {
    ...createMockVoter(
      '123',
      mockDocument.firstName,
      mockDocument.lastName,
      'precinct-id-01'
    ),
    middleName: mockDocument.middleName,
    suffix: mockDocument.nameSuffix,
  };
  // Voter who matches only first and last name of the scanned ID
  const otherMockVoter: Voter = {
    ...createMockVoter(
      '456',
      mockDocument.firstName,
      mockDocument.lastName,
      'precinct-id-01'
    ),
    middleName: '',
    suffix: '',
  };

  // Mock out search that happens when an ID is scanned
  apiMock.expectGetScannedIdDocument(mockDocument);
  apiMock.expectSearchVotersWithResults(mockSearchParams, [mockVoter]);

  const onBarcodeScanMatch = vi.fn();
  const result = renderInAppContext(
    <VoterSearch
      search={mockSearchParams}
      setSearch={vi.fn()}
      onBarcodeScanMatch={onBarcodeScanMatch}
      renderAction={() => null}
      election={election}
    />,
    {
      apiMock,
    }
  );
  unmount = result.unmount;

  await act(() => vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL));

  await vi.waitFor(() => expect(onBarcodeScanMatch).toHaveBeenCalled());
  expect(onBarcodeScanMatch).toHaveBeenCalledWith(mockVoter, {
    type: 'default',
  });

  // Expect to see disabled form input and Edit Search button
  await screen.findByText('Scanned ID');
  const input = screen.getByTestId('scanned-id-input');
  expect(input).toBeDisabled();
  expect(input).toHaveValue(
    `${mockDocument.lastName}, ${mockDocument.firstName} ${mockDocument.middleName} ${mockDocument.nameSuffix}`
  );
  const editSearchButton = screen.getButton('Edit Search');

  // Mock out search that happens when "Edit Search" is clicked
  // and middle name/suffix are removed from the search
  apiMock.expectGetScannedIdDocument();
  apiMock.expectSearchVotersWithResults(
    {
      ...createEmptySearchParams(false),
      firstName: mockDocument.firstName,
      lastName: mockDocument.lastName,
    },
    [mockVoter, otherMockVoter]
  );

  userEvent.click(editSearchButton);

  // After clicking button, full name input and "Edit Search" button should not be rendered
  expect(screen.queryByTestId('scanned-id-input')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit Search' })).toBeNull();

  // Individual first/last name inputs should be rendered
  const lastNameInput = await screen.findByTestId('last-name-input');
  const firstNameInput = screen.getByTestId('first-name-input');
  expect(lastNameInput).toHaveValue(mockDocument.lastName);
  expect(firstNameInput).toHaveValue(mockDocument.firstName);

  // Voter search should display updated search results
  expect(screen.getByTestId('voter-row#123')).toBeDefined();
  expect(screen.getByTestId('voter-row#456')).toBeDefined();
});

test('an ID scan with first and last name only can still render "Edit Search" button', async () => {
  const mockDocument = getMockAamvaDocument({ middleName: '', nameSuffix: '' });
  const mockSearchParams = getMockExactSearchParams({
    middleName: '',
    suffix: '',
  });
  // Voters who exactly match first/last name of the scanned ID.
  const mockVoters: Voter[] = ['123', '456'].map((id) => ({
    ...createMockVoter(
      id,
      mockDocument.firstName,
      mockDocument.lastName,
      'precinct-id-01'
    ),
    middleName: '',
    suffix: '',
  }));

  // Mock out search that happens when an ID is scanned
  apiMock.expectGetScannedIdDocument(mockDocument);
  apiMock.expectSearchVotersWithResults(mockSearchParams, mockVoters);

  const result = renderInAppContext(
    <VoterSearch
      search={mockSearchParams}
      setSearch={vi.fn()}
      onBarcodeScanMatch={vi.fn()}
      renderAction={() => null}
      election={election}
    />,
    {
      apiMock,
    }
  );
  unmount = result.unmount;

  await act(() => vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL));

  // Should render disabled input and "Edit Search" because `exactMatch` search param is set,
  // even if we have no hidden name fields
  await screen.findByText('Scanned ID');
  const input = screen.getByTestId('scanned-id-input');
  expect(input).toBeDisabled();
  expect(input).toHaveValue(
    `${mockDocument.lastName}, ${mockDocument.firstName}`
  );
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
      election={election}
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

  apiMock.expectGetScannedIdDocument(document);

  apiMock.expectSearchVotersWithResultsToChangeFromEmpty({}, searchParams, [
    mockVoter,
  ]);
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

test('validateUsState', () => {
  expect(validateUsState('NH')).toEqual('NH');
});

// Test for barcode scanner happy path is covered in app_poll_worker_screen.test.tsx
