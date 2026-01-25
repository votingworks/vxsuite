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

function getModifiedSearchParams(params: VoterSearchParams): VoterSearchParams {
  return {
    ...params,
    ignoreSuffix: true,
  };
}

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
      search={createEmptySearchParams({ strictMatch: false })}
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
      search={createEmptySearchParams({ strictMatch: false })}
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
  const mockSearchParams = getMockExactSearchParams({ ignoreSuffix: true });
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
      ...createEmptySearchParams({ strictMatch: false }),
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
    ignoreSuffix: true,
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
  apiMock.expectSearchVotersWithResults(
    getModifiedSearchParams(mockSearchParams),
    mockVoters
  );

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

  // Should render disabled input and "Edit Search" because `strictMatch` search param is set,
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
      search={createEmptySearchParams({
        strictMatch: false,
      })}
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
    strictMatch: true,
    ignoreSuffix: true,
  };
  const mockVoter: Voter = {
    ...createMockVoter('123', document.firstName, document.lastName),
    middleName: document.middleName,
    suffix: document.nameSuffix,
  };

  apiMock.expectGetScannedIdDocument(document);

  apiMock.expectSearchVotersWithResultsToChangeFromEmpty(
    {},
    getModifiedSearchParams(searchParams),
    [mockVoter]
  );
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

test('onBarcodeScanMatch is called when exactly one voter matches', async () => {
  const mockDocument = getMockAamvaDocument();
  const mockSearchParams = getMockExactSearchParams({ ignoreSuffix: true });
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

  // Mock out search that happens when an ID is scanned
  apiMock.expectGetScannedIdDocument(mockDocument);
  apiMock.expectSearchVotersWithResults(
    getModifiedSearchParams(mockSearchParams),
    [mockVoter]
  );

  const onBarcodeScanMatch = vi.fn();
  const renderAction = vi.fn();
  const result = renderInAppContext(
    <VoterSearch
      search={mockSearchParams}
      setSearch={vi.fn()}
      onBarcodeScanMatch={onBarcodeScanMatch}
      renderAction={renderAction}
      election={election}
    />,
    {
      apiMock,
    }
  );
  unmount = result.unmount;

  await act(() => vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL));
  await screen.findByText(
    `${mockDocument.lastName}, ${mockDocument.firstName} ${mockDocument.middleName} ${mockDocument.nameSuffix}`
  );
  expect(renderAction).toHaveBeenCalledWith(mockVoter);
  expect(onBarcodeScanMatch).toHaveBeenCalledWith(mockVoter, {
    type: 'default',
  });
});

test('onBarcodeScanMatch not called if more than 1 voter matches', async () => {
  const mockDocument = getMockAamvaDocument();
  const mockSearchParams = getMockExactSearchParams({ ignoreSuffix: true });
  const mockVoters = ['123', '456'].map((voterId) => ({
    ...createMockVoter(
      voterId,
      mockDocument.firstName,
      mockDocument.lastName,
      'precinct-id-01'
    ),
    middleName: mockDocument.middleName,
    suffix: mockDocument.nameSuffix,
  }));

  // Mock out search that happens when an ID is scanned
  apiMock.expectGetScannedIdDocument(mockDocument);
  apiMock.expectSearchVotersWithResults(
    getModifiedSearchParams(mockSearchParams),
    mockVoters
  );

  const onBarcodeScanMatch = vi.fn();
  const renderAction = vi.fn();
  const result = renderInAppContext(
    <VoterSearch
      search={mockSearchParams}
      setSearch={vi.fn()}
      onBarcodeScanMatch={onBarcodeScanMatch}
      renderAction={renderAction}
      election={election}
    />,
    {
      apiMock,
    }
  );
  unmount = result.unmount;

  await act(() => vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL));
  await screen.findByText('Voters matched: 2');
  expect(
    screen.getAllByText(
      `${mockDocument.lastName}, ${mockDocument.firstName} ${mockDocument.middleName} ${mockDocument.nameSuffix}`
    )
  ).toHaveLength(2);
  expect(renderAction).toHaveBeenCalledWith(mockVoters[0]);
  expect(renderAction).toHaveBeenCalledWith(mockVoters[1]);
  expect(onBarcodeScanMatch).not.toHaveBeenCalled();
});

test('validateUsState', () => {
  expect(validateUsState('NH')).toEqual('NH');
});

const possibleLabels = [
  'Registration Deleted',
  'Voter Inactive',
  'New Registration',
  'Updated Name',
] as const;
test.each<{
  description: string;
  newlyRegistered: boolean;
  nameChanged: boolean;
  markedInvalid: boolean;
  expectedLabel: (typeof possibleLabels)[number];
}>([
  {
    description: 'Registration Deleted',
    newlyRegistered: true,
    nameChanged: false,
    markedInvalid: true,
    expectedLabel: 'Registration Deleted',
  },
  {
    description: 'Voter Inactive',
    newlyRegistered: false,
    nameChanged: false,
    markedInvalid: true,
    expectedLabel: 'Voter Inactive',
  },
  {
    description: 'new registration',
    newlyRegistered: true,
    nameChanged: false,
    markedInvalid: false,
    expectedLabel: 'New Registration',
  },
  {
    description: 'updated name',
    newlyRegistered: false,
    nameChanged: true,
    markedInvalid: false,
    expectedLabel: 'Updated Name',
  },
  {
    description:
      'Registration Deleted takes precedence over new registration and updated name',
    newlyRegistered: true,
    nameChanged: true,
    markedInvalid: true,
    expectedLabel: 'Registration Deleted',
  },
  {
    description: 'Voter Inactive takes precedence over updated name',
    newlyRegistered: false,
    nameChanged: true,
    markedInvalid: true,
    expectedLabel: 'Voter Inactive',
  },
  {
    description: 'new registration takes precedence over updated name',
    newlyRegistered: true,
    nameChanged: true,
    markedInvalid: false,
    expectedLabel: 'New Registration',
  },
])(
  'displays appropriate voter labels - $description',
  async ({ newlyRegistered, nameChanged, markedInvalid, expectedLabel }) => {
    const baseVoter = createMockVoter(
      '123',
      'ABIGAIL',
      'ADAMS',
      undefined,
      undefined,
      {
        includeNameChange: nameChanged,
        includeRegistrationEvent: newlyRegistered,
      }
    );
    const voter: Voter = {
      ...baseVoter,
      isInactive: markedInvalid && !newlyRegistered,
      isInvalidatedRegistration: markedInvalid && newlyRegistered,
    };
    apiMock.expectGetScannedIdDocument();
    apiMock.expectSearchVotersWithResults({}, [voter]);

    const result = renderInAppContext(
      <VoterSearch
        search={createEmptySearchParams({ strictMatch: false })}
        setSearch={vi.fn()}
        onBarcodeScanMatch={vi.fn()}
        renderAction={() => null}
        election={election}
      />,
      { apiMock }
    );
    unmount = result.unmount;

    await screen.findByText(expectedLabel);
    for (const label of possibleLabels) {
      // A regression test to ensure that only one label takes precedence and multiple are not
      // accidentally shown
      if (label !== expectedLabel) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
    }
  }
);

// Test for barcode scanner happy path is covered in app_poll_worker_screen.test.tsx
